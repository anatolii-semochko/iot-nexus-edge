# AI Analyzing Camera - wiring

ESP32-CAM (AI-Thinker) on a socket; the ESP32-CAM-MB board is used only
for flashing (the camera board is flashed on its own, without the
peripherals below). No SD card - its pins are reused.

## Pin map

| Function | GPIO | Note |
|---|---|---|
| OLED SDA | 14 | |
| OLED SCL | 15 | strapping pin: HIGH at boot via the module's pull-up - fine |
| Shutter button | 13 | to GND, internal pull-up |
| Green LED | 2 | strapping pin: LED + resistor to GND keeps it LOW - fine |
| Red LED | 12 | strapping pin: MUST be LOW at boot (else 1.8 V flash, no boot) - LED + resistor to GND ensures it |
| Flash | 4 | on-board transistor |
| Buzzer | 3 (U0RXD) | serial log still works on TX (GPIO1) |

## Schematic

```
 5V ──┬──────────────── ESP32-CAM 5V          GND ── ESP32-CAM GND
      ├─ C 470-1000uF ─ GND
      └─ Buzzer(+) ; Buzzer(-) ── C [S8050] E ── GND
                                     B ── 1k ── GPIO3
                                     B ── 10k ── GND   (buzzer off during boot)
                        (magnetic buzzer: 1N4148 reverse-parallel to the buzzer)
 3V3 ── OLED VCC   GND ── OLED GND   GPIO14 ── OLED SDA   GPIO15 ── OLED SCL
 GPIO13 ── [Shutter] ── GND            (INPUT_PULLUP, optional 100nF across)
 GPIO2  ── 330R ── LED green ── GND
 GPIO12 ── 330R ── LED red ── GND
```

## Power

5 V, at least 1 A, 470-1000 uF close to the board's supply pins - WiFi
transmit plus the camera peak well above the 200 mA the module is often
rated at, a classic cause of brownout resets.
