#include "display.h"

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Wire.h>

#include "config.h"

namespace {
Adafruit_SSD1306 oled(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
bool ready = false;
String current;
bool blinking = false;
bool visible = true;

void render(bool show) {
  if (!ready) return;
  oled.clearDisplay();
  if (show) {
    oled.setTextColor(SSD1306_WHITE);
    if (current.length() <= DISPLAY_BIG_MAX_CHARS) {
      oled.setTextSize(2);
      oled.setCursor(0, (OLED_HEIGHT - 16) / 2);
      oled.print(current);
    } else {
      // Word wrap into at most DISPLAY_SMALL_LINES lines; the rest is cut.
      oled.setTextSize(1);
      String rest = current;
      for (int line = 0; line < DISPLAY_SMALL_LINES && rest.length() > 0; line++) {
        String part = rest;
        if (part.length() > DISPLAY_SMALL_LINE_CHARS) {
          int cut = part.lastIndexOf(' ', DISPLAY_SMALL_LINE_CHARS);
          if (cut <= 0) cut = DISPLAY_SMALL_LINE_CHARS;
          part = rest.substring(0, cut);
          rest = rest.substring(cut);
          rest.trim();
        } else {
          rest = "";
        }
        oled.setCursor(0, line * 8);
        oled.print(part);
      }
    }
  }
  oled.display();
}
}  // namespace

bool displayBegin() {
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  ready = oled.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDRESS);
  return ready;
}

void displayShow(const String &text, bool blink) {
  current = text;
  blinking = blink;
  visible = true;
  render(true);
}

void displayStopBlink() {
  if (!blinking) return;
  blinking = false;
  visible = true;
  render(true);
}

void displayUpdate(uint32_t now) {
  if (!blinking) return;
  const bool show = (now / BLINK_PERIOD_MS) % 2 == 0;
  if (show != visible) {
    visible = show;
    render(show);
  }
}
