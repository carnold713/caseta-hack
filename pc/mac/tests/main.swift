// The Mac app's core (Core.swift): what it makes of a screen, how often it looks, and what it says.
// swiftc -O pc/mac/Core.swift pc/mac/tests/main.swift -o coretests && ./coretests
import Foundation

var fails = 0
func check<T: Equatable>(_ name: String, _ got: T, _ want: T) {
    let ok = got == want
    print("\(ok ? "ok  " : "FAIL") \(name)\(ok ? "" : ": \(got) (wanted \(want))")")
    if !ok { fails += 1 }
}

// a w x h picture in BGRA
struct Pic {
    let w: Int, h: Int
    var px: [UInt8]
    init(_ w: Int, _ h: Int) { self.w = w; self.h = h; px = [UInt8](repeating: 0, count: w * h * 4) }
    mutating func fill(_ x0: Int, _ y0: Int, _ x1: Int, _ y1: Int, _ r: UInt8, _ g: UInt8, _ b: UInt8) {
        for y in y0..<y1 { for x in x0..<x1 { let i = (y * w + x) * 4; px[i] = b; px[i + 1] = g; px[i + 2] = r; px[i + 3] = 255 } }
    }
    func cells() -> [UInt8] { px.withUnsafeBufferPointer { Core.grid($0.baseAddress!, w, h, w * 4) } }
}
func all(_ c: [UInt8], _ x0: Int, _ x1: Int, _ r: Int, _ g: Int, _ b: Int, slack: Int = 0) -> Bool {
    for y in 0..<Core.gridH { for x in x0..<x1 {
        let i = (y * Core.gridW + x) * 3
        if abs(Int(c[i]) - r) > slack || abs(Int(c[i + 1]) - g) > slack || abs(Int(c[i + 2]) - b) > slack { return false }
    } }
    return true
}

// left half red, right half blue, as ScreenCaptureKit hands it over (160 x 90) and at 1080p
for (w, h) in [(160, 90), (160, 100), (1920, 1080)] {
    var p = Pic(w, h)
    p.fill(0, 0, w / 2, h, 255, 0, 0)
    p.fill(w / 2, 0, w, h, 0, 0, 255)
    let c = p.cells()
    check("\(w) x \(h): its left half is red", all(c, 0, 8, 255, 0, 0), true)
    check("\(w) x \(h): its right half is blue", all(c, 8, 16, 0, 0, 255), true)
}
var film = Pic(160, 90)
film.fill(0, 12, 160, 78, 200, 120, 40)
check("black bars above and below are left out", all(film.cells(), 0, 16, 200, 120, 40, slack: 1), true)
var wide = Pic(160, 90)
wide.fill(20, 0, 140, 90, 30, 200, 90)
check("black bars beside it are left out", all(wide.cells(), 0, 16, 30, 200, 90, slack: 1), true)
check("a black screen is black", all(Pic(160, 90).cells(), 0, 16, 0, 0, 0), true)
check("a picture too small for a grid is black", Pic(8, 4).cells().max()!, UInt8(0))

let fr = Core.frame([UInt8](repeating: 0, count: Core.cellCount), resume: true)
check("a frame says what it is", Array(fr.prefix(7)), Array("CSY1".utf8) + [1, 16, 9])
check("and is the grid after that", fr.count, 7 + 432)

check("following, the screen moving: as asked", Core.pace(30, "syncing", 0.2), 30)
check("the room off in the app: a glance a second", Core.pace(30, "off", 0), 1)
check("paused by a hand on a light: the same", Core.pace(240, "paused", 0), 1)
check("nothing on the screen moving: a few a second", Core.pace(60, "syncing", 2), 4)
check("no answer from the Pi: as asked", Core.pace(30, nil, 0), 30)

let st = try! JSONSerialization.jsonObject(with: Data(#"{"state":"syncing","room_name":"Collin Office","room":"r1","app_url":"https://hub.example/","want_display":{"id":"2","at":1761264000000,"pc":"Collins-MacBook"}}"#.utf8)) as! [String: Any]
check("the menu says what the room is doing", Core.statusLine(allowed: true, paused: false, black: false, found: true, address: nil, state: st), "Collin Office · following")
check("and when the screen is black", Core.statusLine(allowed: true, paused: false, black: true, found: true, address: nil, state: st).contains("protected video"), true)
check("and when Screen Recording is not allowed", Core.statusLine(allowed: false, paused: false, black: false, found: true, address: nil, state: st), "Allow Screen Recording in System Settings")
check("with no answer, where it is sending", Core.statusLine(allowed: true, paused: false, black: false, found: false, address: "192.168.1.92", state: [:]), "Sending to 192.168.1.92, no answer yet")
check("the positions page", Core.positionsURL(st)?.absoluteString, "https://hub.example/#screen/r1")
check("a display picked in the app for another computer is not this one's", Core.wantedDisplay(st, me: "Other", pickedAt: 0) == nil, true)
check("one for this computer, newer than the last pick here, is", Core.wantedDisplay(st, me: "Collins-MacBook", pickedAt: 5)?.id, "2")
check("an older one is not", Core.wantedDisplay(st, me: "Collins-MacBook", pickedAt: 1761264000001) == nil, true)
check("a change from the Settings page", Core.queryValue(URL(string: "caseta://app/set?b=%7B%22fps%22%3A12%7D")!, "b"), #"{"fps":12}"#)

print(fails == 0 ? "ALL OK" : "FAILED")
exit(fails == 0 ? 0 : 1)
