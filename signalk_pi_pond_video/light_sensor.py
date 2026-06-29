#!/usr/bin/env python3
"""
SignalK Pi Pond Video - BH1750FVI Light Sensor

Reads ambient light (lux) from a BH1750FVI sensor over I2C and publishes
it to SignalK as a delta over MQTT (topic `signalk/delta`) — the same
transport used by the ESP32 pond sensor.

Wiring (Raspberry Pi Zero WH, I2C bus 1):
    BH1750 VCC  -> Pin 1 (3.3V)
    BH1750 GND  -> Pin 6 (GND)
    BH1750 SDA  -> Pin 3 (GPIO2 / SDA1)
    BH1750 SCL  -> Pin 5 (GPIO3 / SCL1)
    BH1750 ADDR -> GND or floating (address 0x23), 3.3V (address 0x5C)

@author Matthieu Laborie
"""

import json
import logging
import threading
import time
from typing import Optional, Dict, Any

# BH1750 one-time high-resolution mode (1 lx resolution).
# The sensor powers down automatically after each measurement,
# so no continuous-mode current draw between readings.
BH1750_ONE_TIME_HIGH_RES = 0x20
BH1750_MEASUREMENT_DELAY_S = 0.18  # datasheet: max 180 ms in high-res mode


class LightSensorPublisher:
    """
    Background thread: reads the BH1750 every `interval` seconds and
    publishes a SignalK delta via MQTT. Degrades gracefully when the
    sensor or the broker is unavailable (logs once, keeps retrying).
    """

    def __init__(self, config: Dict[str, Any]):
        sensor_cfg = config.get('light_sensor', {})
        mqtt_cfg = config.get('mqtt', {})

        self.enabled = sensor_cfg.get('enabled', True)
        self.i2c_bus = sensor_cfg.get('i2c_bus', 1)
        self.address = int(str(sensor_cfg.get('address', '0x23')), 0)
        self.interval = sensor_cfg.get('interval', 60)
        self.signalk_path = sensor_cfg.get(
            'signalk_path', 'environment.outside.pond.illuminance')

        self.mqtt_host = mqtt_cfg.get('host', '192.168.0.10')
        self.mqtt_port = mqtt_cfg.get('port', 1883)
        self.mqtt_topic = mqtt_cfg.get('topic', 'signalk/delta')
        self.source_label = config.get('device', {}).get('name', 'pi-pond-cam')

        self.last_lux: Optional[float] = None
        self._bus = None
        self._mqtt = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._sensor_error_logged = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self):
        if not self.enabled:
            logging.info("Light sensor disabled in configuration")
            return
        if not self._open_bus():
            return
        self._setup_mqtt()
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        logging.info(
            f"Light sensor started (BH1750 @ 0x{self.address:02x} on "
            f"i2c-{self.i2c_bus}, every {self.interval}s -> "
            f"{self.signalk_path})")

    def stop(self):
        self._running = False
        if self._mqtt:
            try:
                self._mqtt.loop_stop()
                self._mqtt.disconnect()
            except Exception:
                pass
        if self._bus:
            try:
                self._bus.close()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # I2C / BH1750
    # ------------------------------------------------------------------

    def _open_bus(self) -> bool:
        try:
            from smbus2 import SMBus
            self._bus = SMBus(self.i2c_bus)
            return True
        except ImportError:
            logging.warning(
                "smbus2 not installed - light sensor disabled "
                "(pip3 install smbus2)")
        except (FileNotFoundError, PermissionError) as e:
            logging.warning(
                f"Cannot open /dev/i2c-{self.i2c_bus} ({e}) - light sensor "
                "disabled. Enable I2C with: sudo raspi-config nonint do_i2c 0")
        return False

    def read_lux(self) -> Optional[float]:
        """Trigger a one-time high-res measurement and return lux."""
        try:
            from smbus2 import i2c_msg
            self._bus.i2c_rdwr(
                i2c_msg.write(self.address, [BH1750_ONE_TIME_HIGH_RES]))
            time.sleep(BH1750_MEASUREMENT_DELAY_S)
            read = i2c_msg.read(self.address, 2)
            self._bus.i2c_rdwr(read)
            data = list(read)
            raw = (data[0] << 8) | data[1]
            lux = raw / 1.2  # datasheet conversion factor
            self._sensor_error_logged = False
            return round(lux, 1)
        except OSError as e:
            if not self._sensor_error_logged:
                logging.warning(
                    f"BH1750 read failed @ 0x{self.address:02x} ({e}) - "
                    "check wiring (will keep retrying)")
                self._sensor_error_logged = True
            return None

    # ------------------------------------------------------------------
    # MQTT / SignalK
    # ------------------------------------------------------------------

    def _setup_mqtt(self):
        try:
            import paho.mqtt.client as mqtt
        except ImportError:
            logging.warning(
                "paho-mqtt not installed - light sensor will read but not "
                "publish (pip3 install paho-mqtt)")
            return

        client_id = f"{self.source_label}-light"
        try:  # paho-mqtt >= 2.0
            self._mqtt = mqtt.Client(
                mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)
        except AttributeError:  # paho-mqtt 1.x
            self._mqtt = mqtt.Client(client_id=client_id)

        self._mqtt.reconnect_delay_set(min_delay=5, max_delay=60)
        try:
            self._mqtt.connect_async(self.mqtt_host, self.mqtt_port)
            self._mqtt.loop_start()  # handles reconnects in background
        except Exception as e:
            logging.warning(f"MQTT setup failed: {e}")
            self._mqtt = None

    def _publish(self, lux: float):
        if not self._mqtt:
            return
        delta = {
            "context": "vessels.self",
            "updates": [{
                "source": {"label": self.source_label, "type": "sensor"},
                "values": [{"path": self.signalk_path, "value": lux}]
            }]
        }
        result = self._mqtt.publish(self.mqtt_topic, json.dumps(delta))
        if result.rc != 0:
            logging.debug(f"MQTT publish failed (rc={result.rc})")

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    def _run(self):
        while self._running:
            lux = self.read_lux()
            if lux is not None:
                self.last_lux = lux
                self._publish(lux)
            # Sleep in small steps so stop() is responsive
            deadline = time.time() + self.interval
            while self._running and time.time() < deadline:
                time.sleep(1)
