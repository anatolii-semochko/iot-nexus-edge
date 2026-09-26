package mqtt

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// Media devices (AGENTS.md section 81): a resource whose profile attributes
// declare `mqttPayload: "media"` receives a whole file (a camera frame) as
// its state payload instead of a text value. The transport uploads it to
// the Devices API's Media Store and uses the returned Media Store id as the
// device's value - the device stays atomic (one String value), the blob
// never travels through EdgeX.
//
//	attributes:
//	  mqttPayload: "media"
//	  mediaExtension: "jpg"   # optional, default "jpg"
const (
	attrPayload       = "mqttPayload"
	attrMediaExt      = "mediaExtension"
	payloadMedia      = "media"
	defaultMediaExt   = "jpg"
	maxUploadRespSize = 64 * 1024
)

// mediaExtensionFrom returns the media extension for a media resource, or
// "" when the resource is an ordinary text-valued one.
func mediaExtensionFrom(attrs map[string]any) (string, error) {
	if fmt.Sprintf("%v", attrs[attrPayload]) != payloadMedia {
		return "", nil
	}
	ext := defaultMediaExt
	if raw, ok := attrs[attrMediaExt]; ok && raw != nil {
		ext = strings.TrimSpace(fmt.Sprintf("%v", raw))
	}
	if ext == "" || strings.ContainsAny(ext, "/.?&#") {
		return "", fmt.Errorf("invalid %s %q", attrMediaExt, ext)
	}
	return ext, nil
}

// uploadMedia stores one media payload in the Devices API's Media Store and
// returns its id.
func (t *Transport) uploadMedia(deviceName, ext string, payload []byte) (string, error) {
	if t.cfg.MediaUploadURL == "" {
		return "", fmt.Errorf("%s is not set", envMediaUploadURL)
	}
	ctx, cancel := context.WithTimeout(context.Background(), t.cfg.MediaUploadTimeout)
	defer cancel()

	target := fmt.Sprintf("%s/%s?ext=%s", t.cfg.MediaUploadURL, url.PathEscape(deviceName), url.QueryEscape(ext))
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, target, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	resp, err := t.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, maxUploadRespSize))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("media upload: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var out struct {
		MediaID string `json:"mediaId"`
	}
	if err := json.Unmarshal(body, &out); err != nil || out.MediaID == "" {
		return "", fmt.Errorf("media upload: unexpected response %q", string(body))
	}
	return out.MediaID, nil
}
