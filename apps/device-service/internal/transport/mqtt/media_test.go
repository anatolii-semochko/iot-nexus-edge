package mqtt

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/edgexfoundry/go-mod-core-contracts/v4/common"
	"github.com/edgexfoundry/go-mod-core-contracts/v4/models"

	sdkModels "github.com/edgexfoundry/device-sdk-go/v4/pkg/models"
)

func TestMediaUploadAndPush(t *testing.T) {
	var uploads [][]byte
	var paths []string
	fail := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		uploads = append(uploads, body)
		paths = append(paths, r.URL.RequestURI())
		if fail {
			http.Error(w, `{"error":"no active Device"}`, http.StatusConflict)
			return
		}
		_, _ = w.Write([]byte(`{"mediaId":"20260926T071234Z_a1b2c3","deviceId":5}`))
	}))
	defer srv.Close()

	tr := newTestTransport()
	tr.http = srv.Client()
	tr.cfg.MediaUploadURL = srv.URL + "/media/edgex"
	tr.cfg.MediaUploadTimeout = 5 * time.Second
	var got []*sdkModels.AsyncValues
	tr.SetPushSink(func(v *sdkModels.AsyncValues) { got = append(got, v) })

	topic := "nexus/cam/image-caster/state"
	// A raw frame cached before binding must be dropped by Bind.
	tr.onState(nil, fakeMessage{topic: topic, payload: []byte("stale-jpeg")})
	props := models.ProtocolProperties{"type": "mqtt", "node": "cam", "device": "image-caster"}
	if err := tr.Bind("cam-image-caster", props, "Image", common.ValueTypeString, map[string]any{"mqttPayload": "media"}); err != nil {
		t.Fatal(err)
	}
	if _, ok := tr.latest[topic]; ok {
		t.Fatal("Bind must drop a raw frame cached before the media binding existed")
	}

	tr.onState(nil, fakeMessage{topic: topic, payload: []byte("jpeg-bytes")})
	if len(uploads) != 1 || string(uploads[0]) != "jpeg-bytes" || paths[0] != "/media/edgex/cam-image-caster?ext=jpg" {
		t.Fatalf("unexpected upload %q to %v", uploads, paths)
	}
	if len(got) != 1 || got[0].CommandValues[0].Value != "20260926T071234Z_a1b2c3" {
		t.Fatalf("push must carry the Media Store id, got %+v", got)
	}
	if string(tr.latest[topic].payload) != "20260926T071234Z_a1b2c3" {
		t.Fatal("Read must serve the Media Store id, not the frame")
	}

	// Retained frames (earlier sessions) are never re-uploaded.
	tr.onState(nil, fakeMessage{topic: topic, payload: []byte("old"), retained: true})
	if len(uploads) != 1 {
		t.Fatal("retained media must be ignored")
	}

	// A failed upload pushes nothing and keeps the last good value.
	fail = true
	tr.onState(nil, fakeMessage{topic: topic, payload: []byte("jpeg-2")})
	if len(got) != 1 || string(tr.latest[topic].payload) != "20260926T071234Z_a1b2c3" {
		t.Fatal("a failed upload must not push or overwrite the last value")
	}
}

func TestMediaExtensionAttribute(t *testing.T) {
	if ext, err := mediaExtensionFrom(nil); err != nil || ext != "" {
		t.Fatalf("no attributes = ordinary resource, got %q %v", ext, err)
	}
	if ext, _ := mediaExtensionFrom(map[string]any{"mqttPayload": "media", "mediaExtension": "png"}); ext != "png" {
		t.Fatalf("got %q", ext)
	}
	if _, err := mediaExtensionFrom(map[string]any{"mqttPayload": "media", "mediaExtension": "../x"}); err == nil {
		t.Fatal("a path-like extension must be rejected")
	}
}
