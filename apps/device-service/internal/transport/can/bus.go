package can

import (
	"net"
	"sync"
	"sync/atomic"
	"time"

	"github.com/edgexfoundry/go-mod-core-contracts/v4/clients/logger"
)

// cachedFrame pairs a received Frame with the wall-clock time it actually
// arrived on the bus - see Latest's own comment for why this is tracked at
// all (AGENTS_TO_DO.md, 2026-08-15).
type cachedFrame struct {
	frame      Frame
	receivedAt time.Time
}

// busConn is one open CAN interface, shared by every device bound to it. A
// background goroutine continuously reads frames and caches the latest one
// per arbitration ID, since physical nodes broadcast telemetry on their own
// schedule - Read must not block waiting for the bus to happen to send the
// right frame.
type busConn struct {
	conn *Conn
	lc   logger.LoggingClient
	name string

	// the reader hit an error (the interface went away) - the connection
	// is to be reopened (see stale)
	dead atomic.Bool

	mu     sync.RWMutex
	latest map[uint32]cachedFrame

	stop chan struct{}
}

// newBusConn opens `ifaceName`; `latest` - the frames a previous
// connection to it had cached (kept across a reopen - each still carries
// its true receipt time), nil for none.
func newBusConn(ifaceName string, lc logger.LoggingClient, latest map[uint32]cachedFrame) (*busConn, error) {
	conn, err := Open(ifaceName)
	if err != nil {
		return nil, err
	}
	if latest == nil {
		latest = make(map[uint32]cachedFrame)
	}

	b := &busConn{
		conn:   conn,
		lc:     lc,
		name:   ifaceName,
		latest: latest,
		stop:   make(chan struct{}),
	}
	go b.readLoop(ifaceName)
	return b, nil
}

func (b *busConn) readLoop(ifaceName string) {
	for {
		frame, err := b.conn.Receive()
		if err != nil {
			select {
			case <-b.stop:
				// Close() closed the socket to unblock Receive; exit quietly.
				return
			default:
				b.lc.Errorf("CAN bus %s: read error, stopping bus reader (reopened on next use): %s", ifaceName, err.Error())
				b.dead.Store(true)
				return
			}
		}

		b.mu.Lock()
		b.latest[frame.ID] = cachedFrame{frame: frame, receivedAt: time.Now()}
		b.mu.Unlock()
	}
}

// Latest returns the most recently received frame for the given
// arbitration ID (if any has been seen since the bus was opened) alongside
// the time it actually arrived. The cache itself never expires - a
// physical node may legitimately broadcast a given signal rarely - so
// staleness is not decided here. Instead the receivedAt time is threaded
// through to the EdgeX Reading's own origin (transport.go's Read, via
// NewCommandValueWithOrigin) so this cached-but-old frame is reported with
// its true age rather than "now", letting the existing timestamp-based
// overdue checks (Devices list, Data Logger) do their job honestly
// (AGENTS_TO_DO.md, 2026-08-15 - previously every on-demand read re-
// stamped stale data as fresh, defeating those checks for any physically
// silent node).
func (b *busConn) Latest(id uint32) (Frame, time.Time, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	c, ok := b.latest[id]
	return c.frame, c.receivedAt, ok
}

// stale tells whether this connection no longer reaches the interface
// named `name`: its reader died, or the interface was re-created under the
// same name (a new kernel index - a re-plugged USB adapter, the interface
// moved into this container's namespace again). One netlink lookup.
func (b *busConn) stale() bool {
	if b.dead.Load() {
		return true
	}
	iface, err := net.InterfaceByName(b.name)
	return err != nil || iface.Index != b.conn.Ifindex()
}

// frames is a copy of the cached frames (handed to a reopened connection).
func (b *busConn) frames() map[uint32]cachedFrame {
	b.mu.RLock()
	defer b.mu.RUnlock()
	out := make(map[uint32]cachedFrame, len(b.latest))
	for id, f := range b.latest {
		out[id] = f
	}
	return out
}

// Send writes a frame to the bus.
func (b *busConn) Send(f Frame) error {
	return b.conn.Send(f)
}

// Close stops the reader goroutine and closes the underlying socket.
func (b *busConn) Close() error {
	close(b.stop)
	return b.conn.Close()
}
