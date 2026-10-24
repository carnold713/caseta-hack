// Caseta screen sync for the Mac: the parts with nothing of the Mac's screen or menus in them, tested by
// tests/main.swift. What the screen becomes (a 16 x 9 grid of colours, black bars left out), how often to look, the
// datagrams the connector hears, and what the menu says. The same rules as the Windows app (pc/windows/core.h).
import Foundation

enum Core {
    static let port: UInt16 = 47700
    static let gridW = 16, gridH = 9
    static let cellCount = gridW * gridH * 3
    static let rates = [12, 20, 30, 60, 120, 240]  // Settings' choices
    static let standbyRate = 1.0    // the room not following: a glance a second keeps the Pi aware of the computer
    static let stillRate = 4.0      // nothing on the screen has moved for a second: look this often until it does
    static let stillAfter = 1.0
    static let lostAfter = 10.0     // no answer from the connector for this long: look for it again
    static let tellEvery = 10.0     // and how often, while it answers, this computer says which displays it has
    static let flagResume: UInt8 = 0x01

    // A picture `w` x `h`, `stride` bytes a row, B, G, R, A a pixel (as macOS holds a screen). Looked at about 10 x 10
    // pixels a cell; rows and then columns at the edges that are black all the way along (a film's bars) are left
    // out, up to a quarter of the picture from each side; a picture black all over is kept whole, so it reads black.
    static func grid(_ px: UnsafePointer<UInt8>, _ w: Int, _ h: Int, _ stride: Int) -> [UInt8] {
        var out = [UInt8](repeating: 0, count: cellCount)
        guard w > 0, h > 0 else { return out }
        let sy = max(1, h / (gridH * 10)), sx = max(1, w / (gridW * 10))
        let H = (h + sy - 1) / sy, W = (w + sx - 1) / sx
        var rgb = [Float](repeating: 0, count: H * W * 3)
        var rowLit = [Bool](repeating: false, count: H), colLit = [Bool](repeating: false, count: W)
        for y in 0..<H {
            let row = px + y * sy * stride
            for x in 0..<W {
                let p = row + x * sx * 4
                let i = (y * W + x) * 3
                rgb[i] = Float(p[2]); rgb[i + 1] = Float(p[1]); rgb[i + 2] = Float(p[0])
                if max(p[0], p[1], p[2]) > 10 { rowLit[y] = true; colLit[x] = true }
            }
        }
        var top = 0, bot = 0, lef = 0, rig = 0
        if rowLit.contains(true) {
            top = min(rowLit.firstIndex(of: true)!, Int(Double(H) * 0.25))
            bot = min(H - 1 - rowLit.lastIndex(of: true)!, Int(Double(H) * 0.25))
            lef = min(colLit.firstIndex(of: true)!, Int(Double(W) * 0.25))
            rig = min(W - 1 - colLit.lastIndex(of: true)!, Int(Double(W) * 0.25))
        }
        let rows = (H - top - bot) / gridH * gridH, cols = (W - lef - rig) / gridW * gridW
        guard rows >= gridH, cols >= gridW else { return out }
        let bh = rows / gridH, bw = cols / gridW
        for gy in 0..<gridH {
            for gx in 0..<gridW {
                var s: (Double, Double, Double) = (0, 0, 0)
                for y in 0..<bh {
                    for x in 0..<bw {
                        let i = ((top + gy * bh + y) * W + (lef + gx * bw + x)) * 3
                        s.0 += Double(rgb[i]); s.1 += Double(rgb[i + 1]); s.2 += Double(rgb[i + 2])
                    }
                }
                let n = Double(bh * bw), o = (gy * gridW + gx) * 3
                out[o] = UInt8(min(255, max(0, s.0 / n)))
                out[o + 1] = UInt8(min(255, max(0, s.1 / n)))
                out[o + 2] = UInt8(min(255, max(0, s.2 / n)))
            }
        }
        return out
    }

    static func frame(_ cells: [UInt8], resume: Bool) -> Data {
        var d = Data("CSY1".utf8)
        d.append(contentsOf: [resume ? flagResume : 0, UInt8(gridW), UInt8(gridH)])
        d.append(contentsOf: cells)
        return d
    }

    // How far two looks differ: the largest change in any colour of any cell
    static func moved(_ a: [UInt8], _ b: [UInt8]) -> Int {
        guard a.count == b.count else { return 255 }
        var m = 0
        for i in 0..<a.count { m = max(m, abs(Int(a[i]) - Int(b[i]))) }
        return m
    }

    // How often to look now: `rate` while the room follows and the screen moves; a glance a second while the Pi says
    // the room is not following (off, paused, or stuck on a problem); stillRate once nothing has moved for a second.
    // While the Pi has not answered, whether the room follows is not known, so the full rate stands.
    static func pace(_ rate: Double, _ roomState: String?, _ stillFor: Double) -> Double {
        if rate <= 0 { return 0 }
        if let s = roomState, ["off", "paused", "problem"].contains(s) { return min(rate, standbyRate) }
        if stillFor >= stillAfter { return min(rate, stillRate) }
        return rate
    }

    // What the menu says the room is doing, from what the connector last said and this computer's own state
    static func statusLine(allowed: Bool, paused: Bool, black: Bool, found: Bool, address: String?, state st: [String: Any]) -> String {
        if !allowed { return "Allow Screen Recording in System Settings" }
        if paused { return "Paused" }
        let state = st["state"] as? String
        if black && state == "syncing" { return "The screen looks black (protected video like Netflix can't be read)" }
        if !found {
            if let a = address, !a.isEmpty { return "Sending to \(a), no answer yet" }
            return "Looking for the connector"
        }
        let room = (st["room_name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "No room"
        switch state {
        case "off": return "Choose a room in the app"
        case "syncing": return "\(room) · following"
        case "paused": return "\(room) · paused"
        case "problem": return "\(room) · \((st["why"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "not following")"
        default: return "\(room) · starting"
        }
    }

    // The app's positions page for the room that follows, when the connector has said where the app is
    static func positionsURL(_ st: [String: Any]) -> URL? {
        guard let app = st["app_url"] as? String, !app.isEmpty, let room = st["room"] as? String, !room.isEmpty else { return nil }
        return URL(string: "\(app)#room/\(room)/screen")
    }

    // The display picked in the app (the connector's "want_display"), when it is meant for this computer and newer
    // than the last choice made here: its id ("" for the main display) and when it was picked
    static func wantedDisplay(_ st: [String: Any], me: String, pickedAt: Double) -> (id: String, at: Double)? {
        guard let w = st["want_display"] as? [String: Any], let at = (w["at"] as? NSNumber)?.doubleValue else { return nil }
        if let pc = w["pc"] as? String, !pc.isEmpty, pc != me { return nil }
        guard at > pickedAt else { return nil }
        return ((w["id"] as? String) ?? "", at)
    }

    // The text after "?b=" in a request's address, decoded: how the Settings page sends a change
    static func queryValue(_ url: URL, _ key: String) -> String? {
        URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == key }?.value
    }
}
