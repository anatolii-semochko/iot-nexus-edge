// OV3660 capture (full 3MP JPEG into PSRAM) with the on-board flash.
#pragma once
#include "esp_camera.h"

bool cameraBegin();
// Takes one frame with the flash on. Caller returns it with
// esp_camera_fb_return(). nullptr on failure.
camera_fb_t *cameraCapture();
