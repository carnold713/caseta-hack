// Caseta screen sync for the Mac: shows the colours on this Mac's screen to the Caseta connector on the Pi, which
// streams them to the room's Hue lights (agent/screensync.py).
//
// Built to cost next to nothing:
//   * The screen comes from ScreenCaptureKit, asked for a picture 160 pixels across: the graphics chip shrinks it, so
//     a look is about 60 kilobytes, and macOS hands one over only when something on the screen has changed. The
//     processor only averages a 16 x 9 grid of colours out of it (Core.swift).
//   * It looks as often as Settings says while the room follows and the screen moves; a few times a second while
//     nothing moves; once a second while the room is off or paused in the app; not at all while paused here.
//   * Nothing in the menu bar moves. Settings is a small window showing pc/settings.html (the same page the Windows
//     app shows), made when it is opened and let go when it is closed.
//
// The conversation with the connector is UDP on 47700: frames "CSY1", queries "CSQ1" with what this computer says of
// itself, answers "CSS1" with the room's state. Settings, the log and the Screen Recording permission are where the
// earlier app kept them: ~/Library/Application Support/CasetaScreenSync/settings.json, ~/Library/Logs/
// CasetaScreenSync/log.txt, and the app's identifier, app.caseta.screensync.
import AppKit
import CoreGraphics
import CoreMedia
import Darwin
import ScreenCaptureKit
import WebKit

let version = "2.0"
let appName = "CasetaScreenSync"
let home = FileManager.default.homeDirectoryForCurrentUser
let logDir = home.appendingPathComponent("Library/Logs/\(appName)")
let configDir = home.appendingPathComponent("Library/Application Support/\(appName)")
let agentPlist = home.appendingPathComponent("Library/LaunchAgents/app.caseta.screensync.plist")

func mono() -> Double { ProcessInfo.processInfo.systemUptime }
func orNull(_ s: String?) -> Any { s.map { $0 as Any } ?? NSNull() }
func epochMs() -> Double { (Date().timeIntervalSince1970 * 1000).rounded() }

// ---------- the log ----------
enum Log {
    static let queue = DispatchQueue(label: "log")
    static let stamp: DateFormatter = { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm:ss,SSS"; return f }()
    static func info(_ msg: String) {
        let line = "\(stamp.string(from: Date())) INFO \(msg)\n"
        queue.async {
            try? FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
            let url = logDir.appendingPathComponent("log.txt")
            if let h = try? FileHandle(forWritingTo: url) {
                h.seekToEndOfFile()
                h.write(Data(line.utf8))
                try? h.close()
            } else {
                try? Data(line.utf8).write(to: url)
            }
        }
    }
}

func residentMB() -> Int {
    var info = mach_task_basic_info()
    var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
    let kr = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count) }
    }
    return kr == KERN_SUCCESS ? Int(info.resident_size / (1024 * 1024)) : 0
}

// ---------- settings.json ----------
// {"pi": address typed in or null, "last_pi": the address last found, "fps": one of Core.rates, "display": the
// display followed (null: the main one), "display_at": when it was picked, in ms, here or in the app}
final class Settings {
    private let lock = NSLock()
    private var data: [String: Any] = [:]
    private let url = configDir.appendingPathComponent("settings.json")
    init() {
        if let d = try? Data(contentsOf: url), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] { data = o }
    }
    func str(_ k: String) -> String? { lock.lock(); defer { lock.unlock() }; return (data[k] as? String).flatMap { $0.isEmpty ? nil : $0 } }
    func num(_ k: String, _ dflt: Double) -> Double { lock.lock(); defer { lock.unlock() }; return (data[k] as? NSNumber)?.doubleValue ?? dflt }
    func set(_ k: String, _ v: Any?) {
        lock.lock()
        data[k] = v ?? NSNull()
        let copy = data
        lock.unlock()
        try? FileManager.default.createDirectory(at: configDir, withIntermediateDirectories: true)
        if let d = try? JSONSerialization.data(withJSONObject: copy) { try? d.write(to: url, options: .atomic) }
    }
}
let settings = Settings()

// ---------- the displays ----------
struct Display { let id: String; let name: String; let main: Bool; let cg: CGDirectDisplayID }
func listDisplays() -> [Display] {
    var ids = [CGDirectDisplayID](repeating: 0, count: 16)
    var n: UInt32 = 0
    guard CGGetActiveDisplayList(16, &ids, &n) == .success else { return [] }
    let main = CGMainDisplayID()
    var out: [Display] = []
    var k = 0
    for did in ids.prefix(Int(n)).sorted(by: { ($0 == main ? 0 : 1) < ($1 == main ? 0 : 1) }) {
        let b = CGDisplayBounds(did)
        let label: String
        if CGDisplayIsBuiltin(did) != 0 { label = "Built-in display" } else { k += 1; label = "Display \(k)" }
        out.append(Display(id: String(did), name: "\(label) · \(Int(b.width)) x \(Int(b.height))", main: did == main, cg: did))
    }
    return out
}
func displaysJSON(_ ds: [Display]) -> [[String: Any]] { ds.map { ["id": $0.id, "name": $0.name, "main": $0.main] } }

// ---------- the connector ----------
func hostname() -> String {
    var buf = [CChar](repeating: 0, count: 256)
    let h = gethostname(&buf, buf.count) == 0 ? String(cString: buf) : ""
    let short = h.split(separator: ".").first.map(String.init) ?? h
    return String((short.isEmpty ? "Mac" : short).prefix(40))
}

final class Link {
    private let lock = NSLock()
    private let fd: Int32
    private var state: [String: Any] = [:]
    private var fixed: String?
    private var addr: String?
    private var heardAt = -1e9, askedAt = -1e9, toldAt = mono()

    init(fixed: String?, last: String?) {
        fd = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        var yes: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_BROADCAST, &yes, socklen_t(MemoryLayout<Int32>.size))
        _ = fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK)
        var me = sockaddr_in()
        me.sin_family = sa_family_t(AF_INET)
        _ = withUnsafePointer(to: &me) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
        self.fixed = fixed
        addr = fixed ?? last
    }
    var last: [String: Any] { lock.lock(); defer { lock.unlock() }; return state }
    var address: String? { lock.lock(); defer { lock.unlock() }; return addr }
    var found: Bool { lock.lock(); defer { lock.unlock() }; return addr != nil && mono() - heardAt < Core.lostAfter }
    func setFixed(_ pi: String?) {
        lock.lock(); defer { lock.unlock() }
        fixed = pi
        if let p = pi { addr = p }
        heardAt = -1e9
        askedAt = -1e9
    }
    func tellSoon() { lock.lock(); toldAt = -1e9; lock.unlock() }

    // Read answers; look for the connector when it has not been heard from for a while; say again every so often who
    // this computer is and which displays it has, for the app's picker
    func tick(about: [String: Any]) {
        var buf = [UInt8](repeating: 0, count: 65536)
        while true {
            var from = sockaddr_in()
            var fl = socklen_t(MemoryLayout<sockaddr_in>.size)
            let n = withUnsafeMutablePointer(to: &from) { p in
                p.withMemoryRebound(to: sockaddr.self, capacity: 1) { recvfrom(fd, &buf, buf.count, 0, $0, &fl) }
            }
            if n <= 0 { break }
            guard n > 4, buf[0] == 0x43, buf[1] == 0x53, buf[2] == 0x53, buf[3] == 0x31,
                  let st = try? JSONSerialization.jsonObject(with: Data(buf[4..<n])) as? [String: Any] else { continue }
            var ip = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
            var a = from.sin_addr
            inet_ntop(AF_INET, &a, &ip, socklen_t(INET_ADDRSTRLEN))
            let who = String(cString: ip)
            lock.lock()
            if let f = fixed, f != who { lock.unlock(); continue }  // another connector answering a broadcast
            state = st
            let isNew = addr != who
            addr = who
            heardAt = mono()
            lock.unlock()
            if isNew {
                Log.info("found the connector at \(who)")
                settings.set("last_pi", who)
            }
        }
        let now = mono()
        lock.lock()
        let lost = now - heardAt > Core.lostAfter
        let broadcast = fixed == nil
        let to = addr
        var ask = false, tell = false
        if lost && now - askedAt > 2 { askedAt = now; ask = true }
        else if !lost && to != nil && now - toldAt > Core.tellEvery { toldAt = now; tell = true }
        lock.unlock()
        guard ask || tell, let body = try? JSONSerialization.data(withJSONObject: about) else { return }
        let q = Data("CSQ1".utf8) + body
        if ask && broadcast { sendTo(q, "255.255.255.255") }
        if let t = to { sendTo(q, t) }
    }
    func send(_ data: Data) { if let t = address { sendTo(data, t) } }
    private func sendTo(_ data: Data, _ host: String) {
        var to = sockaddr_in()
        to.sin_family = sa_family_t(AF_INET)
        to.sin_port = Core.port.bigEndian
        if inet_pton(AF_INET, host, &to.sin_addr) != 1 {
            var hints = addrinfo()
            hints.ai_family = AF_INET
            var res: UnsafeMutablePointer<addrinfo>?
            guard getaddrinfo(host, nil, &hints, &res) == 0, let r = res else { return }
            to.sin_addr = r.pointee.ai_addr.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr }
            freeaddrinfo(res)
        }
        data.withUnsafeBytes { raw in
            _ = withUnsafePointer(to: &to) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                sendto(fd, raw.baseAddress, data.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
        }
    }
}

// ---------- the screen: ScreenCaptureKit, shrunk by the graphics chip ----------
final class Capture: NSObject, SCStreamOutput, SCStreamDelegate {
    private let lock = NSLock()
    private let queue = DispatchQueue(label: "capture", qos: .utility)
    private var stream: SCStream?
    private var config: SCStreamConfiguration?
    private var cells: [UInt8]?
    private(set) var frames = 0          // pictures received, so the loop can tell a new one from the last
    private(set) var display: String?    // the display being looked at
    private(set) var fps = 0.0
    private(set) var busy = false        // starting or stopping
    private(set) var failedAt = -1e9

    var running: Bool { lock.lock(); defer { lock.unlock() }; return stream != nil }
    func latest() -> (cells: [UInt8]?, frames: Int) { lock.lock(); defer { lock.unlock() }; return (cells, frames) }

    func start(display want: String?, fps rate: Double) {
        lock.lock()
        if busy { lock.unlock(); return }
        busy = true
        lock.unlock()
        stop { [weak self] in self?.open(want, rate) }
    }
    private func open(_ want: String?, _ rate: Double) {
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { [weak self] content, error in
            guard let self else { return }
            guard let content else { self.failed("the screen could not be looked at (\(error?.localizedDescription ?? "no displays"))"); return }
            let mainID = CGMainDisplayID()
            guard let d = content.displays.first(where: { String($0.displayID) == want })
                    ?? content.displays.first(where: { $0.displayID == mainID }) ?? content.displays.first else {
                self.failed("no display to look at"); return
            }
            // its own windows (Settings) are left out of what it sees
            let me = content.applications.filter { $0.bundleIdentifier == Bundle.main.bundleIdentifier }
            let filter = SCContentFilter(display: d, excludingApplications: me, exceptingWindows: [])
            let cfg = SCStreamConfiguration()
            cfg.width = 160
            cfg.height = max(90, Int((160.0 * Double(d.height) / Double(max(1, d.width))).rounded()))
            cfg.pixelFormat = kCVPixelFormatType_32BGRA
            cfg.showsCursor = false
            cfg.queueDepth = 3
            cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(max(1, Int(rate.rounded()))))
            let s = SCStream(filter: filter, configuration: cfg, delegate: self)
            do {
                try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: self.queue)
            } catch {
                self.failed("could not take the screen's pictures (\(error.localizedDescription))"); return
            }
            s.startCapture { [weak self] err in
                guard let self else { return }
                if let err { self.failed("could not start looking (\(err.localizedDescription))"); return }
                self.lock.lock()
                self.stream = s
                self.config = cfg
                self.fps = rate
                self.busy = false
                let changed = self.display != String(d.displayID)
                self.display = String(d.displayID)
                self.lock.unlock()
                if changed { Log.info("following \(listDisplays().first { $0.cg == d.displayID }?.name ?? "display \(d.displayID)")") }
            }
        }
    }
    private func failed(_ why: String) {
        lock.lock()
        stream = nil
        busy = false
        let say = mono() - failedAt > 60
        failedAt = mono()
        lock.unlock()
        if say { Log.info(why) }
    }
    func setRate(_ rate: Double) {
        lock.lock()
        guard let s = stream, let cfg = config, !busy, abs(rate - fps) > 0.01 else { lock.unlock(); return }
        fps = rate
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(max(1, Int(rate.rounded()))))
        lock.unlock()
        s.updateConfiguration(cfg) { _ in }
    }
    func stop(then done: (() -> Void)? = nil) {
        lock.lock()
        let s = stream
        stream = nil
        cells = nil
        lock.unlock()
        guard let s else { done?(); return }
        s.stopCapture { _ in done?() }
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sb.isValid,
              let info = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = info.first?[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete,
              let pb = CMSampleBufferGetImageBuffer(sb) else { return }
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(pb) else { return }
        let g = Core.grid(base.assumingMemoryBound(to: UInt8.self), CVPixelBufferGetWidth(pb), CVPixelBufferGetHeight(pb),
                          CVPixelBufferGetBytesPerRow(pb))
        lock.lock()
        cells = g
        frames += 1
        lock.unlock()
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        failed("stopped looking (\(error.localizedDescription))")
    }
}

// ---------- the loop ----------
final class Sync {
    let link: Link
    let capture = Capture()
    private let lock = NSLock()
    private var _paused = false, _black = false, _allowed = false
    private var resumeUntil = 0.0
    private var want: String?
    private var wantNew = true
    private var shown: [Display] = []
    var fps: Double

    init() {
        fps = max(5, min(240, settings.num("fps", 20)))
        want = settings.str("display")
        link = Link(fixed: settings.str("pi"), last: settings.str("last_pi"))
    }
    var paused: Bool { get { lock.lock(); defer { lock.unlock() }; return _paused } set { lock.lock(); _paused = newValue; lock.unlock() } }
    var black: Bool { lock.lock(); defer { lock.unlock() }; return _black }
    var allowed: Bool { lock.lock(); defer { lock.unlock() }; return _allowed }
    var displays: [Display] { lock.lock(); defer { lock.unlock() }; return shown }
    var following: String? {
        lock.lock(); defer { lock.unlock() }
        if let w = want, shown.contains(where: { $0.id == w }) { return w }
        return shown.first { $0.main }?.id ?? shown.first?.id
    }
    func resumeRoom() { lock.lock(); _paused = false; resumeUntil = mono() + 1; lock.unlock() }
    func setDisplay(_ id: String?, at: Double) {
        lock.lock(); want = id; wantNew = true; lock.unlock()
        settings.set("display", id)
        settings.set("display_at", at)
        link.tellSoon()
    }
    func status() -> String {
        Core.statusLine(allowed: allowed, paused: paused, black: black, found: link.found, address: link.address, state: link.last)
    }

    func run() {
        let me = hostname()
        var next = mono(), stillFrom = next, blackFrom: Double? = nil, checkedAt = -1e9, listedAt = -1e9, notedAt = next
        var last: [UInt8]? = nil, seen = 0, sent = 0, notedSent = 0, wasFound = false
        let activity = ProcessInfo.processInfo.beginActivity(options: .userInitiatedAllowingIdleSystemSleep, reason: "following the screen")
        defer { ProcessInfo.processInfo.endActivity(activity) }
        while true {
            let now = mono()
            if now - checkedAt > 5 {  // Screen Recording, until it is allowed: a newer macOS says so without a restart
                checkedAt = now
                let ok = CGPreflightScreenCaptureAccess()
                if ok != allowed { lock.lock(); _allowed = ok; lock.unlock(); if ok { Log.info("Screen Recording is allowed") } }
            }
            if now - listedAt > 5 {
                listedAt = now
                let ds = listDisplays()
                lock.lock(); shown = ds; lock.unlock()
            }
            var about: [String: Any] = ["name": me, "os": "mac", "v": version, "displays": displaysJSON(displays)]
            about["display"] = orNull(capture.display)
            // how it is looking, and what it last saw, for the connector's log
            if let c = last {
                var sum = [0, 0, 0]
                for i in 0..<c.count { sum[i % 3] += Int(c[i]) }
                about["capture"] = String(format: "screencapturekit 160 across, saw #%02x%02x%02x", sum[0] / 144, sum[1] / 144, sum[2] / 144)
            } else {
                about["capture"] = capture.running ? "screencapturekit, nothing seen yet" : "not looking"
            }
            link.tick(about: about)
            let st = link.last
            if let w = Core.wantedDisplay(st, me: me, pickedAt: settings.num("display_at", 0)) {
                Log.info("the app picked display \(w.id.isEmpty ? "(main)" : w.id)")
                setDisplay(w.id.isEmpty ? nil : w.id, at: w.at)
            }
            let found = link.found
            if found != wasFound {
                wasFound = found
                if found { Log.info("the connector is answering") }
                else if let a = link.address { Log.info("the connector stopped answering (\(a))") }
            }
            if now - notedAt >= 600 {
                Log.info("running: \(sent - notedSent) frames in \(Int((now - notedAt) / 60)) min, memory \(residentMB()) MB")
                notedAt = now
                notedSent = sent
            }
            let roomState = found ? st["state"] as? String : nil
            // the stream is asked for no more than the room needs: a picture a second while it is not following
            let streamRate = (roomState.map { ["off", "paused", "problem"].contains($0) } ?? false) ? Core.standbyRate : fps
            if allowed && !paused {
                lock.lock(); let reopen = wantNew; let asked = want; wantNew = false; lock.unlock()
                if reopen || (!capture.running && !capture.busy && now - capture.failedAt > 2) {
                    capture.start(display: asked, fps: streamRate)
                    if reopen { last = nil }
                } else {
                    capture.setRate(streamRate)
                }
                let (cells, frames) = capture.latest()
                if let c = cells, frames != seen {
                    seen = frames
                    if let l = last, Core.moved(c, l) > 3 { stillFrom = now }
                    last = c
                    blackFrom = (c.max() ?? 0) < 8 ? (blackFrom ?? now) : nil
                    lock.lock(); _black = blackFrom.map { now - $0 > 5 } ?? false; lock.unlock()
                }
                if let c = last {  // unchanged is sent again too: the connector takes silence for the computer gone
                    lock.lock(); let resume = mono() < resumeUntil; lock.unlock()
                    link.send(Core.frame(c, resume: resume))
                    sent += 1
                }
            } else if capture.running {
                capture.stop()  // paused here: nothing looked at, nothing held
            }
            let looking = Core.pace(fps, roomState, now - stillFrom)
            next += 1 / (looking > 0 ? looking : 2)
            let wait = next - mono()
            if wait > 0 { Thread.sleep(forTimeInterval: wait) }
            if mono() - next > 1 { next = mono() }  // the Mac slept: start the beat again rather than catch up
        }
    }
}
let sync = Sync()

// ---------- open at login: a LaunchAgent, as the earlier app made it ----------
func opensAtLogin() -> Bool { FileManager.default.fileExists(atPath: agentPlist.path) }
func setOpenAtLogin(_ on: Bool) {
    if !on { try? FileManager.default.removeItem(at: agentPlist); return }
    let plist: [String: Any] = ["Label": "app.caseta.screensync", "ProgramArguments": ["/usr/bin/open", "-a", Bundle.main.bundlePath],
                                "RunAtLoad": true]
    try? FileManager.default.createDirectory(at: agentPlist.deletingLastPathComponent(), withIntermediateDirectories: true)
    if let d = try? PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0) { try? d.write(to: agentPlist) }
}

// ---------- what macOS recorded about an earlier run's end, into the log once each ----------
func reportEarlierCrashes() {
    let seenURL = logDir.appendingPathComponent("reports_seen.txt")
    var seen = Set(((try? String(contentsOf: seenURL)) ?? "").split(separator: "\n").map(String.init))
    var added = false
    for dir in [home.appendingPathComponent("Library/Logs/DiagnosticReports"), URL(fileURLWithPath: "/Library/Logs/DiagnosticReports")] {
        guard let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey]) else { continue }
        for f in files where f.pathExtension == "ips" && (f.lastPathComponent.hasPrefix(appName) || f.lastPathComponent.hasPrefix("JetsamEvent")) && !seen.contains(f.lastPathComponent) {
            let when = (try? f.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            guard Date().timeIntervalSince(when) < 7 * 86400, let text = try? String(contentsOf: f) else { continue }
            seen.insert(f.lastPathComponent)
            added = true
            let parts = text.split(separator: "\n", maxSplits: 1).map(String.init)
            guard parts.count == 2, let body = try? JSONSerialization.jsonObject(with: Data(parts[1].utf8)) as? [String: Any] else { continue }
            if let procs = body["processes"] as? [[String: Any]] {
                if let p = procs.first(where: { $0["name"] as? String == appName }), let why = p["reason"] as? String {
                    Log.info("an earlier run ended (\(f.lastPathComponent)): macOS stopped it for memory (\(why))")
                }
                continue
            }
            let exc = body["exception"] as? [String: Any] ?? [:]
            let what = [exc["type"], exc["signal"]].compactMap { $0 as? String }.joined(separator: " ")
            let asi = (body["asi"] as? [String: Any] ?? [:]).values.map { "\($0)" }.joined(separator: " ")
            Log.info("an earlier run ended (\(f.lastPathComponent)): \(what) \(asi)")
        }
    }
    if added { try? seen.sorted().joined(separator: "\n").write(to: seenURL, atomically: true, encoding: .utf8) }
}

// ---------- the menu bar and the Settings window ----------
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, NSWindowDelegate, WKURLSchemeHandler {
    var item: NSStatusItem!
    var window: NSWindow?
    var openSettingsNow = false

    func applicationDidFinishLaunching(_ note: Notification) {
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let img = NSImage(systemSymbolName: "display", accessibilityDescription: "Caseta screen sync")
        img?.isTemplate = true
        item.button?.image = img
        item.button?.toolTip = "Caseta screen sync"
        let menu = NSMenu()
        menu.delegate = self
        item.menu = menu
        // what the room is doing, in the tooltip; looked at every two seconds, changed only when it changes
        Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            let tip = "Caseta screen sync · \(sync.status())"
            if self?.item.button?.toolTip != tip { self?.item.button?.toolTip = tip }
        }
        let t = Thread { sync.run() }
        t.qualityOfService = .utility
        t.start()
        if openSettingsNow { openSettings() }
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let status = NSMenuItem(title: sync.status(), action: nil, keyEquivalent: "")
        status.isEnabled = false
        menu.addItem(status)
        menu.addItem(withTitle: "Settings", action: #selector(openSettings), keyEquivalent: ",").target = self
        let ds = sync.displays
        if ds.count > 1 {
            let sub = NSMenu()
            let on = sync.following
            for d in ds {
                let it = NSMenuItem(title: d.name, action: #selector(pickDisplay(_:)), keyEquivalent: "")
                it.target = self
                it.representedObject = d.main ? "" : d.id
                it.state = d.id == on ? .on : .off
                sub.addItem(it)
            }
            let di = NSMenuItem(title: "Display", action: nil, keyEquivalent: "")
            di.submenu = sub
            menu.addItem(di)
        }
        let pos = NSMenuItem(title: "Light positions", action: Core.positionsURL(sync.link.last) == nil ? nil : #selector(openPositions), keyEquivalent: "")
        pos.target = self
        menu.addItem(pos)
        menu.addItem(withTitle: roomPaused() ? "Resume" : "Pause", action: #selector(togglePause), keyEquivalent: "").target = self
        menu.addItem(withTitle: "Quit", action: #selector(quit), keyEquivalent: "q").target = self
    }
    func roomPaused() -> Bool { sync.paused || (sync.link.last["state"] as? String) == "paused" }

    @objc func pickDisplay(_ it: NSMenuItem) {
        let id = it.representedObject as? String ?? ""
        sync.setDisplay(id.isEmpty ? nil : id, at: epochMs())
    }
    @objc func openPositions() {
        if let u = Core.positionsURL(sync.link.last) { NSWorkspace.shared.open(u) }
    }
    @objc func togglePause() { if roomPaused() { sync.resumeRoom() } else { sync.paused = true } }
    @objc func quit() { Log.info("quit"); NSApp.terminate(nil) }

    @objc func openSettings() {
        if window == nil {
            let cfg = WKWebViewConfiguration()
            cfg.setURLSchemeHandler(self, forURLScheme: "caseta")
            let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 400, height: 620), configuration: cfg)
            web.setValue(false, forKey: "drawsBackground")
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 400, height: 620), styleMask: [.titled, .closable, .miniaturizable],
                             backing: .buffered, defer: false)
            w.title = "Caseta screen sync"
            w.appearance = NSAppearance(named: .darkAqua)
            w.backgroundColor = NSColor(red: 0x10 / 255.0, green: 0x17 / 255.0, blue: 0x19 / 255.0, alpha: 1)
            w.isReleasedWhenClosed = false
            w.contentView = web
            w.delegate = self
            w.center()
            web.load(URLRequest(url: URL(string: "caseta://app/")!))
            window = w
        }
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }
    // closed: the window and its page are let go, so nothing of it stays in memory
    func windowWillClose(_ note: Notification) {
        (window?.contentView as? WKWebView)?.stopLoading()
        window?.contentView = nil
        window = nil
    }

    // The page's own requests: the page itself, its state, and its changes (?b=<json>)
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let path = url.path
        var body = Data(), type = "application/json"
        switch path {
        case "/", "":
            type = "text/html"
            body = (try? Data(contentsOf: Bundle.main.url(forResource: "settings", withExtension: "html") ?? URL(fileURLWithPath: "/"))) ?? Data()
        case "/state":
            body = stateJSON()
        case "/set":
            if let b = Core.queryValue(url, "b"), let o = try? JSONSerialization.jsonObject(with: Data(b.utf8)) as? [String: Any] { change(o) }
            body = stateJSON()
        case "/positions":
            openPositions()
            body = stateJSON()
        default:
            break
        }
        task.didReceive(URLResponse(url: url, mimeType: type, expectedContentLength: body.count, textEncodingName: "utf-8"))
        task.didReceive(body)
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    func stateJSON() -> Data {
        let st: [String: Any] = [
            "status": sync.status(), "paused": sync.paused, "fps": Int(sync.fps), "game": "gentle",
            "pi": orNull(settings.str("pi")), "found": orNull(sync.link.address), "login": opensAtLogin(), "os": "mac",
            "positions": Core.positionsURL(sync.link.last) != nil, "displays": displaysJSON(sync.displays), "display": sync.following ?? "",
        ]
        return (try? JSONSerialization.data(withJSONObject: st)) ?? Data("{}".utf8)
    }
    func change(_ b: [String: Any]) {
        if let p = b["paused"] as? Bool { if p { sync.paused = true } else { sync.resumeRoom() } }
        if let f = (b["fps"] as? NSNumber)?.intValue, Core.rates.contains(f) { sync.fps = Double(f); settings.set("fps", f) }
        if let d = b["display"] as? String, d.isEmpty || sync.displays.contains(where: { $0.id == d }) {
            let main = sync.displays.first { $0.main }?.id
            sync.setDisplay(d.isEmpty || d == main ? nil : d, at: epochMs())
        }
        if b.keys.contains("pi") {
            var pi = ((b["pi"] as? String) ?? "").trimmingCharacters(in: .whitespaces)
            if pi.contains(where: { !($0.isLetter || $0.isNumber || ".-:".contains($0)) }) { pi = "" }
            settings.set("pi", pi.isEmpty ? nil : pi)
            sync.link.setFixed(pi.isEmpty ? nil : pi)
        }
        if let on = b["login"] as? Bool { setOpenAtLogin(on) }
    }
}

// ---------- --selftest: look at the screen once, say what it saw and what it cost ----------
func selftest() -> Int32 {
    _ = NSApplication.shared  // (the Settings page's web view wants an application around it)
    let cap = Capture()
    let t0 = mono()
    cap.start(display: nil, fps: 30)
    while mono() - t0 < 6 && cap.latest().frames == 0 { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
    let (cells, frames) = cap.latest()
    var out: [String: Any] = ["capture": frames > 0 ? "screencapturekit, 160 across" : "none", "allowed": CGPreflightScreenCaptureAccess(),
                              "displays": displaysJSON(listDisplays()), "ms_first": Int((mono() - t0) * 1000), "memory_mb": residentMB()]
    if let c = cells {
        var s = [0, 0, 0]
        for i in 0..<c.count { s[i % 3] += Int(c[i]) }
        out["average"] = s.map { $0 / (c.count / 3) }
    }
    // the Settings page, as its window shows it: it loads, says what is going on, and a change made from it is kept
    let handler = AppDelegate()
    let cfg = WKWebViewConfiguration()
    cfg.setURLSchemeHandler(handler, forURLScheme: "caseta")
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 400, height: 620), configuration: cfg)
    web.load(URLRequest(url: URL(string: "caseta://app/")!))
    var page: Any = "no answer"
    func js(_ code: String, _ done: @escaping (Any?) -> Void) { web.evaluateJavaScript(code) { r, e in done(r ?? e.map { "\($0)" }) } }
    let t1 = mono()
    var stage = 0
    while mono() - t1 < 10 && stage < 3 {
        RunLoop.main.run(until: Date().addingTimeInterval(0.1))
        if stage == 0 && mono() - t1 > 2 {
            stage = 1
            js("post('set', { fps: 30 }); 'sent'") { _ in stage = 2 }
        } else if stage == 2 {
            stage = 3
            let t2 = mono()
            while mono() - t2 < 1.5 { RunLoop.main.run(until: Date().addingTimeInterval(0.1)) }
            var got: Any? = nil
            js("JSON.stringify({ status: document.getElementById('state').textContent, fps: document.getElementById('fps').value, mac: document.querySelector('.win').classList.contains('hide') })") { r in got = r }
            let t3 = mono()
            while got == nil && mono() - t3 < 3 { RunLoop.main.run(until: Date().addingTimeInterval(0.1)) }
            page = got ?? "no answer"
        }
    }
    out["settings_page"] = page
    out["settings_kept_fps"] = settings.num("fps", 0)
    if let d = try? JSONSerialization.data(withJSONObject: out, options: .sortedKeys) { print(String(decoding: d, as: UTF8.self)) }
    return 0
}

// ---------- start ----------
let args = CommandLine.arguments
if args.contains("--selftest") { exit(selftest()) }
// one copy at a time (the earlier app took the same port, so the two never run together either)
let lockFD = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
var lockAddr = sockaddr_in()
lockAddr.sin_family = sa_family_t(AF_INET)
lockAddr.sin_port = (Core.port + 1).bigEndian
lockAddr.sin_addr.s_addr = inet_addr("127.0.0.1")
let bound = withUnsafePointer(to: &lockAddr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(lockFD, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
if bound != 0 { Log.info("already running"); Thread.sleep(forTimeInterval: 0.2); exit(0) }
if let i = args.firstIndex(of: "--pi"), i + 1 < args.count { sync.link.setFixed(args[i + 1]) }
_ = setpriority(PRIO_PROCESS, 0, 10)
reportEarlierCrashes()
if !CGPreflightScreenCaptureAccess() { _ = CGRequestScreenCaptureAccess() }  // the system's own prompt, the first time
Log.info("screen sync \(version) started (native, \(Int(sync.fps)) a second, connector \(sync.link.address ?? "to be found"))")
let app = NSApplication.shared
let delegate = AppDelegate()
delegate.openSettingsNow = args.contains("--settings")
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
