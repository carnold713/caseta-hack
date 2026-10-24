// Caseta screen sync for Windows: shows the colours on this PC's screen to the Caseta connector on the Pi, which
// streams them to the room's Hue lights (agent/screensync.py).
//
// Built to cost next to nothing, above all while a game runs:
//   * The screen comes from Desktop Duplication, which hands over a frame only when something on the screen has
//     changed. The graphics card shrinks it (a texture's mip levels, made by the card) to about 240 pixels across
//     before anything is read back, so a look moves a few kilobytes, not a 4K frame, and the processor only averages
//     a 16 x 9 grid of colours out of it.
//   * It looks as often as Settings says while the room follows and the screen moves; a few times a second while
//     nothing moves; once a second while the room is off or paused in the app; gently, or not at all, while a game
//     fills the screen. It runs below normal priority, asks Windows for its efficiency mode, and gives the graphics
//     card's work the lowest priority there is.
//   * Nothing on the tray moves. Settings is a page served here on 127.0.0.1 (pc/settings.html, the same page the
//     Mac app shows) and opened in a small Edge window, so nothing of it is in memory until it is opened.
//
// The conversation with the connector is UDP on 47700 (core.h): frames "CSY1", queries "CSQ1" with what this
// computer says of itself, answers "CSS1" with the room's state.
//
//   CasetaScreenSync.exe               run in the tray
//   CasetaScreenSync.exe --pi 192.168.1.20
//   CasetaScreenSync.exe --settings    run, and open Settings at once
//   CasetaScreenSync.exe --selftest    look at the screen, say what it saw and what it cost, and exit
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00  // Windows 10's calls (an HDR screen's SDR white)
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <d3d11.h>
#include <dxgi1_6.h>
#include <mstcpip.h>
#include <psapi.h>
#include <shellapi.h>
#include <wrl/client.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <ctime>
#include <mutex>
#include <random>
#include <string>
#include <thread>
#include <vector>

#include "core.h"
#include "page.h"

// Windows Graphics Capture, for an HDR screen: Windows makes an ordinary 8-bit picture of it, which Desktop
// Duplication does not do reliably on every card (some hand an HDR screen back black). Built with Visual Studio's
// compiler, whose Windows headers carry it; a build without them uses Desktop Duplication for every screen.
#if defined(_MSC_VER)
#define CASETA_WGC 1
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <winrt/base.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#pragma comment(lib, "windowsapp.lib")
#else
#define CASETA_WGC 0
#endif

#ifndef SIO_UDP_CONNRESET
#define SIO_UDP_CONNRESET _WSAIOW(IOC_VENDOR, 12)
#endif

using Microsoft::WRL::ComPtr;
using core::Json;

static const char* VERSION = "2.6";
static const wchar_t* APP = L"CasetaScreenSync";

// ---------- small things ----------
static std::wstring wide(const std::string& s) {
  if (s.empty()) return L"";
  int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), int(s.size()), nullptr, 0);
  std::wstring w(size_t(n), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, s.c_str(), int(s.size()), &w[0], n);
  return w;
}
static std::string narrow(const std::wstring& w) {
  if (w.empty()) return "";
  int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), int(w.size()), nullptr, 0, nullptr, nullptr);
  std::string s(size_t(n), '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.c_str(), int(w.size()), &s[0], n, nullptr, nullptr);
  return s;
}
static double mono() { return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count(); }
static double epoch_ms() { return double(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count()); }
static std::wstring env_dir(const wchar_t* var) {
  wchar_t buf[MAX_PATH];
  DWORD n = GetEnvironmentVariableW(var, buf, MAX_PATH);
  std::wstring d = (n && n < MAX_PATH) ? std::wstring(buf) : L".";
  d += L"\\";
  d += APP;
  CreateDirectoryW(d.c_str(), nullptr);
  return d;
}
static std::string read_file(const std::wstring& path) {
  std::string out;
  FILE* f = _wfopen(path.c_str(), L"rb");
  if (!f) return out;
  char buf[4096];
  size_t n;
  while ((n = fread(buf, 1, sizeof buf, f)) > 0) out.append(buf, n);
  fclose(f);
  return out;
}
static void write_file(const std::wstring& path, const std::string& text) {
  const std::wstring tmp = path + L".tmp";
  FILE* f = _wfopen(tmp.c_str(), L"wb");
  if (!f) return;
  fwrite(text.data(), 1, text.size(), f);
  fclose(f);
  MoveFileExW(tmp.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING);
}
static size_t memory_mb(bool peak) {
  PROCESS_MEMORY_COUNTERS pmc{};
  pmc.cb = sizeof pmc;
  if (!GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof pmc)) return 0;
  return (peak ? pmc.PeakWorkingSetSize : pmc.WorkingSetSize) / (1024 * 1024);
}

// ---------- the log: %LOCALAPPDATA%\CasetaScreenSync\log.txt ----------
static std::mutex g_log_mu;
static std::wstring g_log_path;
static void logf(const char* fmt, ...) {
  char msg[1024];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(msg, sizeof msg, fmt, ap);
  va_end(ap);
  SYSTEMTIME t;
  GetLocalTime(&t);
  char line[1200];
  snprintf(line, sizeof line, "%04d-%02d-%02d %02d:%02d:%02d,%03d INFO %s\n", t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute,
           t.wSecond, t.wMilliseconds, msg);
  std::lock_guard<std::mutex> lock(g_log_mu);
  if (g_log_path.empty()) return;
  FILE* f = _wfopen(g_log_path.c_str(), L"ab");
  if (!f) return;
  fputs(line, f);
  fclose(f);
}

// ---------- settings.json in %APPDATA%\CasetaScreenSync, the same file the earlier app kept ----------
// {"pi": address typed in or null, "last_pi": the address last found, "fps": one of core::RATES, "game":
// "gentle"|"full"|"pause", "display": the display followed (null: the main one), "display_at": when it was picked,
// in ms, here or in the app}
struct Settings {
  std::mutex mu;
  Json data = Json::object();
  std::wstring path;
  void load() {
    path = env_dir(L"APPDATA") + L"\\settings.json";
    Json d = Json::parse(read_file(path));
    if (d.kind == Json::Object) data = d;
  }
  std::string str(const std::string& k) { std::lock_guard<std::mutex> l(mu); return data[k].str(); }
  double num(const std::string& k, double dflt) { std::lock_guard<std::mutex> l(mu); return data[k].num(dflt); }
  void set(const std::string& k, const Json& v) {
    std::lock_guard<std::mutex> l(mu);
    data.o[k] = v;
    write_file(path, data.dump());
  }
  std::string game() { std::string g = str("game"); return g.empty() ? "gentle" : g; }
};
static Settings g_settings;

// ---------- the displays ----------
struct Display {
  std::string id, name;  // id "d<adapter>.<output>", the same numbering the earlier app used
  bool main = false;
  UINT adapter = 0, output = 0;
};
static std::vector<Display> list_displays() {
  std::vector<Display> out;
  ComPtr<IDXGIFactory1> f;
  if (FAILED(CreateDXGIFactory1(__uuidof(IDXGIFactory1), reinterpret_cast<void**>(f.GetAddressOf())))) return out;
  ComPtr<IDXGIAdapter1> a;
  for (UINT i = 0; f->EnumAdapters1(i, a.ReleaseAndGetAddressOf()) != DXGI_ERROR_NOT_FOUND; i++) {
    ComPtr<IDXGIOutput> o;
    for (UINT j = 0; a->EnumOutputs(j, o.ReleaseAndGetAddressOf()) != DXGI_ERROR_NOT_FOUND; j++) {
      DXGI_OUTPUT_DESC d;
      if (FAILED(o->GetDesc(&d)) || !d.AttachedToDesktop) continue;
      MONITORINFO mi{};
      mi.cbSize = sizeof mi;
      GetMonitorInfoW(d.Monitor, &mi);
      Display x;
      x.adapter = i;
      x.output = j;
      x.id = "d" + std::to_string(i) + "." + std::to_string(j);
      x.main = (mi.dwFlags & MONITORINFOF_PRIMARY) != 0;
      const RECT r = d.DesktopCoordinates;
      x.name = std::to_string(r.right - r.left) + " x " + std::to_string(r.bottom - r.top);
      out.push_back(x);
    }
  }
  std::stable_sort(out.begin(), out.end(), [](const Display& a, const Display& b) { return a.main && !b.main; });
  for (size_t k = 0; k < out.size(); k++) out[k].name = "Display " + std::to_string(k + 1) + " \xc2\xb7 " + out[k].name;
  return out;
}
static Json displays_json(const std::vector<Display>& ds) {
  Json a = Json::array();
  for (const auto& d : ds) {
    Json x = Json::object();
    x.o["id"] = Json::of(d.id);
    x.o["name"] = Json::of(d.name);
    x.o["main"] = Json::of(d.main);
    a.a.push_back(x);
  }
  return a;
}

// ---------- an HDR screen's SDR white ----------
// What "SDR content brightness" in Windows' display settings makes white, as the scale that brings it to 1.0 in the
// linear picture Windows hands over (1.0 there is 80 nits). 200 nits when Windows will not say.
static float sdr_white_scale(const wchar_t* gdi_name) {
  UINT32 np = 0, nm = 0;
  if (GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &np, &nm) != ERROR_SUCCESS) return 1 / 2.5f;
  std::vector<DISPLAYCONFIG_PATH_INFO> paths(np);
  std::vector<DISPLAYCONFIG_MODE_INFO> modes(nm);
  if (QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, &np, paths.data(), &nm, modes.data(), nullptr) != ERROR_SUCCESS) return 1 / 2.5f;
  for (UINT32 i = 0; i < np; i++) {
    DISPLAYCONFIG_SOURCE_DEVICE_NAME src{};
    src.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
    src.header.size = sizeof src;
    src.header.adapterId = paths[i].sourceInfo.adapterId;
    src.header.id = paths[i].sourceInfo.id;
    if (DisplayConfigGetDeviceInfo(&src.header) != ERROR_SUCCESS || wcscmp(src.viewGdiDeviceName, gdi_name) != 0) continue;
    struct { DISPLAYCONFIG_DEVICE_INFO_HEADER header; ULONG level; } white{};  // DISPLAYCONFIG_SDR_WHITE_LEVEL
    white.header.type = static_cast<DISPLAYCONFIG_DEVICE_INFO_TYPE>(11);       // ..._GET_SDR_WHITE_LEVEL
    white.header.size = sizeof white;
    white.header.adapterId = paths[i].targetInfo.adapterId;
    white.header.id = paths[i].targetInfo.id;
    if (DisplayConfigGetDeviceInfo(&white.header) == ERROR_SUCCESS && white.level >= 1000) return 1000.f / float(white.level);
  }
  return 1 / 2.5f;
}

static bool g_force_wgc = false;  // --wgc: Windows Graphics Capture for every screen (how CI tries it on a plain one)

#if CASETA_WGC
// One screen through Windows Graphics Capture, asked for in 8 bits: frames come when the screen changes, as with
// Desktop Duplication, and only the newest one is kept
class WgcSource {
 public:
  bool open(ID3D11Device* dev, HMONITOR mon) {
    namespace cap = winrt::Windows::Graphics::Capture;
    try {
      if (!cap::GraphicsCaptureSession::IsSupported()) return false;
      auto interop = winrt::get_activation_factory<cap::GraphicsCaptureItem, IGraphicsCaptureItemInterop>();
      winrt::check_hresult(interop->CreateForMonitor(mon, winrt::guid_of<cap::GraphicsCaptureItem>(), winrt::put_abi(item_)));
      ComPtr<IDXGIDevice> dxgi;
      winrt::check_hresult(dev->QueryInterface(IID_PPV_ARGS(&dxgi)));
      winrt::com_ptr<::IInspectable> insp;
      winrt::check_hresult(CreateDirect3D11DeviceFromDXGIDevice(dxgi.Get(), insp.put()));
      device_ = insp.as<winrt::Windows::Graphics::DirectX::Direct3D11::IDirect3DDevice>();
      pool_ = cap::Direct3D11CaptureFramePool::CreateFreeThreaded(device_, winrt::Windows::Graphics::DirectX::DirectXPixelFormat::B8G8R8A8UIntNormalized, 2,
                                                                  item_.Size());
      session_ = pool_.CreateCaptureSession(item_);
      try { session_.IsCursorCaptureEnabled(false); } catch (...) {}
      // no yellow frame around the screen, where Windows lets an app say so (Windows 11)
      try {
        cap::GraphicsCaptureAccess::RequestAccessAsync(cap::GraphicsCaptureAccessKind::Borderless).get();
        session_.IsBorderRequired(false);
      } catch (...) {}
      session_.StartCapture();
      return true;
    } catch (...) {
      close();
      return false;
    }
  }
  // the newest frame's texture, held until done(); nothing when the screen has not changed
  ComPtr<ID3D11Texture2D> next() {
    try {
      for (auto f = pool_.TryGetNextFrame(); f; f = pool_.TryGetNextFrame()) {
        if (frame_) frame_.Close();
        frame_ = f;
      }
      if (!frame_) return nullptr;
      auto access = frame_.Surface().as<::Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess>();
      ComPtr<ID3D11Texture2D> t;
      winrt::check_hresult(access->GetInterface(IID_PPV_ARGS(&t)));
      return t;
    } catch (...) {
      return nullptr;
    }
  }
  void done() {
    try { if (frame_) frame_.Close(); } catch (...) {}
    frame_ = nullptr;
  }
  void close() {
    done();
    try { if (session_) session_.Close(); } catch (...) {}
    try { if (pool_) pool_.Close(); } catch (...) {}
    session_ = nullptr; pool_ = nullptr; item_ = nullptr; device_ = nullptr;
  }
  ~WgcSource() { close(); }

 private:
  winrt::Windows::Graphics::Capture::GraphicsCaptureItem item_{nullptr};
  winrt::Windows::Graphics::DirectX::Direct3D11::IDirect3DDevice device_{nullptr};
  winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool pool_{nullptr};
  winrt::Windows::Graphics::Capture::GraphicsCaptureSession session_{nullptr};
  winrt::Windows::Graphics::Capture::Direct3D11CaptureFrame frame_{nullptr};
};
#endif

// ---------- the screen: Desktop Duplication, shrunk by the graphics card ----------
class Capture {
 public:
  std::string display;  // the one being looked at ("" until opened)
  bool gpu = false;     // shrunk by the card (false: read back whole, the slow way, on a card that cannot)
  bool hdr = false;     // the screen is in HDR
  bool newer = false;   // duplicated the newer way (a picture asked for in 8 bits)
  int sw = 0, sh = 0;   // the size read back

  bool open(const std::string& want) {
    close();
    const auto ds = list_displays();
    if (ds.empty()) return false;
    const Display* pick = &ds[0];
    for (const auto& d : ds) if (d.id == want) pick = &d;
    ComPtr<IDXGIFactory1> f;
    if (FAILED(CreateDXGIFactory1(__uuidof(IDXGIFactory1), reinterpret_cast<void**>(f.GetAddressOf())))) return false;
    ComPtr<IDXGIAdapter1> a;
    ComPtr<IDXGIOutput> o;
    ComPtr<IDXGIOutput1> o1;
    if (FAILED(f->EnumAdapters1(pick->adapter, &a)) || FAILED(a->EnumOutputs(pick->output, &o)) || FAILED(o.As(&o1))) return false;
    const D3D_FEATURE_LEVEL levels[] = {D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_1, D3D_FEATURE_LEVEL_10_0};
    if (FAILED(D3D11CreateDevice(a.Get(), D3D_DRIVER_TYPE_UNKNOWN, nullptr, 0, levels, 3, D3D11_SDK_VERSION, &dev_, nullptr, &ctx_))) return false;
    // the card's time goes to the game first: this work waits behind everything else
    ComPtr<IDXGIDevice> dd;
    if (SUCCEEDED(dev_.As(&dd))) dd->SetGPUThreadPriority(-7);
    // An HDR screen: asked for as an ordinary 8-bit picture, which Windows makes from it (the older way of asking
    // gives some cards' HDR screens back black). The older way stays for a Windows without the newer one.
    hdr = false;
    DXGI_OUTPUT_DESC od;
    white_ = SUCCEEDED(o->GetDesc(&od)) ? sdr_white_scale(od.DeviceName) : 1 / 2.5f;
    ComPtr<IDXGIOutput6> o6;
    if (SUCCEEDED(o.As(&o6))) {
      DXGI_OUTPUT_DESC1 d1;
      if (SUCCEEDED(o6->GetDesc1(&d1))) hdr = d1.ColorSpace == DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020;
    }
#if CASETA_WGC
    wgc_.reset();
    if (hdr || g_force_wgc) {
      wgc_ = std::make_unique<WgcSource>();
      if (wgc_->open(dev_.Get(), od.Monitor)) {
        display = pick->id;
        if (display != last_logged_) { logf("following %s (Windows Graphics Capture)", pick->name.c_str()); last_logged_ = display; }
        return true;
      }
      wgc_.reset();
      logf("Windows Graphics Capture would not start; Desktop Duplication instead");
    }
#endif
    ComPtr<IDXGIOutput5> o5;
    const DXGI_FORMAT want8[] = {DXGI_FORMAT_B8G8R8A8_UNORM};
    newer = SUCCEEDED(o.As(&o5)) && SUCCEEDED(o5->DuplicateOutput1(dev_.Get(), 0, 1, want8, &dup_));
    if (!newer && FAILED(o1->DuplicateOutput(dev_.Get(), &dup_))) { close(); return false; }
    display = pick->id;
    if (display != last_logged_) { logf("following %s", pick->name.c_str()); last_logged_ = display; }
    return true;
  }
  void close() {
    if (dup_ && held_) dup_->ReleaseFrame();
    held_ = false;
#if CASETA_WGC
    wgc_.reset();
#endif
    whole_.Reset(); staging_.Reset(); srv_.Reset(); mip_.Reset(); dup_.Reset(); ctx_.Reset(); dev_.Reset();
    w_ = h_ = 0;
  }
  bool is_open() const {
#if CASETA_WGC
    if (wgc_) return true;
#endif
    return dup_ != nullptr;
  }

  // 1: a new picture (in `cells`); 0: nothing on the screen has changed; -1: it cannot be looked at now (the secure
  // desktop, a full-screen game holding the screen, a change of display mode), so it is opened again later
  int look(core::Cells& cells, UINT wait_ms = 0) {
#if CASETA_WGC
    if (wgc_) {
      ComPtr<ID3D11Texture2D> tex = wgc_->next();
      for (UINT waited = 0; !tex && waited < wait_ms; waited += 10) { Sleep(10); tex = wgc_->next(); }
      if (!tex) return 0;
      int got = 0;
      if (prepare(tex.Get())) {
        ctx_->CopySubresourceRegion(mip_.Get(), 0, 0, 0, 0, tex.Get(), 0, nullptr);
        got = read(cells) ? 1 : 0;
        describe_first(got, cells);
      }
      wgc_->done();
      return got;
    }
#endif
    if (!dup_) return -1;
    DXGI_OUTDUPL_FRAME_INFO info;
    ComPtr<IDXGIResource> res;
    HRESULT hr = dup_->AcquireNextFrame(wait_ms, &info, &res);
    if (hr == DXGI_ERROR_WAIT_TIMEOUT) return 0;
    if (FAILED(hr)) { close(); return -1; }
    held_ = true;
    int got = 0;
    // The frame is held until its pixels have been read back: the copies are only queued until then, and the screen's
    // surface is Windows' again the moment it is released, so a card that runs them later would read what is no
    // longer the screen (black, on a real card; the test machine's software one never showed it)
    if (info.LastPresentTime.QuadPart != 0 || !w_) {  // a mouse move alone changes nothing the lights show
      ComPtr<ID3D11Texture2D> tex;
      if (SUCCEEDED(res.As(&tex)) && prepare(tex.Get())) {
        ctx_->CopySubresourceRegion(mip_.Get(), 0, 0, 0, 0, tex.Get(), 0, nullptr);
        got = read(cells) ? 1 : 0;
        // A shrunk picture that comes back black while the whole one is not: this card's mips are no good for the
        // screen, so it is read whole from now on (looked at again every half minute while the picture stays black)
        if (got && gpu && core::brightest(cells) < 8 && mono() - checked_at_ > 30) {
          checked_at_ = mono();
          core::Cells whole{};
          if (read_whole(whole) && core::brightest(whole) >= 8) {
            logf("the graphics card's shrunk picture came back black; reading the screen whole instead");
            use_whole();
            cells = whole;
          }
        }
        describe_first(got, cells);
      }
    }
    dup_->ReleaseFrame();
    held_ = false;
    return got;
  }
  void describe_first(int got, const core::Cells& cells) {
    if (!got || described_) return;
    described_ = true;
    long long sum[3] = {0, 0, 0};
    for (int i = 0; i < core::CELLS; i++) sum[i % 3] += cells[i];
    logf("first look: %s, %d x %d of %u x %u (format %d), average %lld %lld %lld", gpu ? "shrunk by the card" : "read whole", sw, sh, w_, h_,
         int(fmt_), sum[0] / 144, sum[1] / 144, sum[2] / 144);
  }
  std::string describe() const {
    return std::string(gpu ? "shrunk " : "whole ") + std::to_string(sw) + "x" + std::to_string(sh) + " of " + std::to_string(w_) + "x" +
           std::to_string(h_) + (hdr ? " hdr, white " + std::to_string(int(80 / white_ + 0.5f)) + " nits" : "") + via() + " fmt " +
           std::to_string(int(fmt_));
  }
  std::string via() const {
#if CASETA_WGC
    if (wgc_) return " wgc";
#endif
    return newer ? " dd" : " dd (older way)";
  }

 private:
  ComPtr<ID3D11Device> dev_;
  ComPtr<ID3D11DeviceContext> ctx_;
  ComPtr<IDXGIOutputDuplication> dup_;
  ComPtr<ID3D11Texture2D> mip_, staging_, whole_;
  ComPtr<ID3D11ShaderResourceView> srv_;
  UINT w_ = 0, h_ = 0, level_ = 0;
  DXGI_FORMAT fmt_ = DXGI_FORMAT_UNKNOWN;
  float white_ = 1 / 2.5f;  // an HDR screen's SDR white, as the scale that makes it 1.0
#if CASETA_WGC
  std::unique_ptr<WgcSource> wgc_;
#endif
  bool held_ = false, described_ = false;
  double checked_at_ = -1e9;
  std::string last_logged_;

  // the level read back (the screen shrunk, or the screen whole), into cells; Map waits for the queued copies
  bool read(core::Cells& cells) {
    if (gpu) ctx_->GenerateMips(srv_.Get());
    ctx_->CopySubresourceRegion(staging_.Get(), 0, 0, 0, 0, mip_.Get(), level_, nullptr);
    D3D11_MAPPED_SUBRESOURCE m;
    if (FAILED(ctx_->Map(staging_.Get(), 0, D3D11_MAP_READ, 0, &m))) return false;
    cells = cells_of(m, sw, sh);
    ctx_->Unmap(staging_.Get(), 0);
    return true;
  }
  // An 8-bit screen is read as it is; an HDR one (16-bit floats, which Windows hands over for an HDR screen even
  // when asked for 8 bits) is turned into 8-bit colour first, its own SDR white as white
  core::Cells cells_of(const D3D11_MAPPED_SUBRESOURCE& m, int w, int h) const {
    if (fmt_ == DXGI_FORMAT_R16G16B16A16_FLOAT) {
      const auto bgra = core::scrgb_to_bgra(static_cast<const uint8_t*>(m.pData), w, h, int(m.RowPitch), white_);
      return core::grid(bgra.data(), w, h, w * 4);
    }
    return core::grid(static_cast<const uint8_t*>(m.pData), w, h, int(m.RowPitch));
  }
  bool make_whole() {
    if (whole_) return true;
    D3D11_TEXTURE2D_DESC sd{};
    sd.Width = w_; sd.Height = h_; sd.MipLevels = 1; sd.ArraySize = 1; sd.Format = fmt_;
    sd.SampleDesc.Count = 1; sd.Usage = D3D11_USAGE_STAGING; sd.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
    return SUCCEEDED(dev_->CreateTexture2D(&sd, nullptr, &whole_));
  }
  bool read_whole(core::Cells& cells) {
    if (!make_whole()) return false;
    ctx_->CopySubresourceRegion(whole_.Get(), 0, 0, 0, 0, mip_.Get(), 0, nullptr);
    D3D11_MAPPED_SUBRESOURCE m;
    if (FAILED(ctx_->Map(whole_.Get(), 0, D3D11_MAP_READ, 0, &m))) return false;
    cells = cells_of(m, int(w_), int(h_));
    ctx_->Unmap(whole_.Get(), 0);
    return true;
  }
  void use_whole() {
    gpu = false;
    level_ = 0;
    staging_ = whole_;
    sw = int(w_);
    sh = int(h_);
    whole_by_choice_ = true;
  }
  bool whole_by_choice_ = false;  // kept for the life of the app: a card whose mips came back black once does again

  // A texture the screen's size with every mip level, which the card fills by averaging down; the level read back is
  // the smallest still at least 160 x 90, about 10 x 10 pixels a cell. A card that cannot make mips for the screen's
  // format gets the whole screen read back instead.
  bool prepare(ID3D11Texture2D* tex) {
    D3D11_TEXTURE2D_DESC d;
    tex->GetDesc(&d);
    if (mip_ && d.Width == w_ && d.Height == h_) return true;
    mip_.Reset(); srv_.Reset(); staging_.Reset(); whole_.Reset();
    w_ = d.Width; h_ = d.Height; level_ = 0; gpu = false; fmt_ = d.Format; described_ = false;
    D3D11_TEXTURE2D_DESC md{};
    md.Width = d.Width; md.Height = d.Height; md.MipLevels = 0; md.ArraySize = 1; md.Format = d.Format;
    md.SampleDesc.Count = 1; md.Usage = D3D11_USAGE_DEFAULT;
    md.BindFlags = D3D11_BIND_SHADER_RESOURCE | D3D11_BIND_RENDER_TARGET; md.MiscFlags = D3D11_RESOURCE_MISC_GENERATE_MIPS;
    UINT support = 0;
    if (!whole_by_choice_ && SUCCEEDED(dev_->CheckFormatSupport(d.Format, &support)) && (support & D3D11_FORMAT_SUPPORT_MIP_AUTOGEN) &&
        SUCCEEDED(dev_->CreateTexture2D(&md, nullptr, &mip_)) && SUCCEEDED(dev_->CreateShaderResourceView(mip_.Get(), nullptr, &srv_))) {
      gpu = true;
      while ((w_ >> (level_ + 1)) >= 160 && (h_ >> (level_ + 1)) >= 90) level_++;
    } else {
      mip_.Reset(); srv_.Reset();
      md.MipLevels = 1; md.BindFlags = 0; md.MiscFlags = 0;
      if (FAILED(dev_->CreateTexture2D(&md, nullptr, &mip_))) return false;
    }
    sw = int(std::max(1u, w_ >> level_));
    sh = int(std::max(1u, h_ >> level_));
    D3D11_TEXTURE2D_DESC sd{};
    sd.Width = UINT(sw); sd.Height = UINT(sh); sd.MipLevels = 1; sd.ArraySize = 1; sd.Format = d.Format;
    sd.SampleDesc.Count = 1; sd.Usage = D3D11_USAGE_STAGING; sd.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
    return SUCCEEDED(dev_->CreateTexture2D(&sd, nullptr, &staging_));
  }
};

// ---------- a game filling the screen ----------
static bool game_in_front() {
  HWND hwnd = GetForegroundWindow();
  if (!hwnd) return false;
  wchar_t cls[64] = {0};
  GetClassNameW(hwnd, cls, 64);
  for (const wchar_t* k : {L"Progman", L"WorkerW", L"Shell_TrayWnd", L"Windows.UI.Core.CoreWindow"})
    if (wcscmp(cls, k) == 0) return false;
  RECT r;
  GetWindowRect(hwnd, &r);
  MONITORINFO mi{};
  mi.cbSize = sizeof mi;
  GetMonitorInfoW(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST), &mi);
  const RECT m = mi.rcMonitor;
  return r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom;
}

// ---------- the connector ----------
static std::string hostname() {
  char buf[256] = {0};
  if (gethostname(buf, sizeof buf) != 0) return "PC";
  std::string h(buf);
  h = h.substr(0, h.find('.'));
  return h.substr(0, 40);
}

class Link {
 public:
  std::mutex mu;
  Json state;              // the connector's last answer
  std::string fixed;       // the address typed into Settings
  std::string addr;        // where frames go: the address typed in, else the one last found
  double heard_at = -1e9;

  bool start() {
    sock_ = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (sock_ == INVALID_SOCKET) return false;
    BOOL yes = TRUE;
    setsockopt(sock_, SOL_SOCKET, SO_BROADCAST, reinterpret_cast<const char*>(&yes), sizeof yes);
    u_long nb = 1;
    ioctlsocket(sock_, FIONBIO, &nb);
    // Windows reports an earlier send that found nobody as an error on the next read; that is not news here
    BOOL no = FALSE;
    DWORD ret = 0;
    WSAIoctl(sock_, SIO_UDP_CONNRESET, &no, sizeof no, nullptr, 0, &ret, nullptr, nullptr);
    sockaddr_in me{};
    me.sin_family = AF_INET;
    bind(sock_, reinterpret_cast<sockaddr*>(&me), sizeof me);
    told_at_ = mono();
    return true;
  }
  void set_fixed(const std::string& pi) {
    std::lock_guard<std::mutex> l(mu);
    fixed = pi;
    if (!pi.empty()) addr = pi;
    heard_at = -1e9;
    asked_at_ = -1e9;
  }
  bool found() { std::lock_guard<std::mutex> l(mu); return !addr.empty() && mono() - heard_at < core::LOST_S; }
  std::string where() { std::lock_guard<std::mutex> l(mu); return addr; }
  Json last() { std::lock_guard<std::mutex> l(mu); return state; }
  void tell_soon() { told_at_ = -1e9; }

  // Read answers; look for the connector when it has not been heard from for a while; say again every so often
  // who this computer is and which displays it has, for the app's picker
  void tick(const std::string& about) {
    char buf[65536];
    for (;;) {
      sockaddr_in from{};
      int fl = sizeof from;
      int n = recvfrom(sock_, buf, sizeof buf, 0, reinterpret_cast<sockaddr*>(&from), &fl);
      if (n <= 0) break;
      if (n < 4 || memcmp(buf, "CSS1", 4) != 0) continue;
      bool ok = false;
      Json st = Json::parse(std::string(buf + 4, size_t(n - 4)), &ok);
      if (!ok) continue;
      char ip[64] = {0};
      inet_ntop(AF_INET, &from.sin_addr, ip, sizeof ip);
      std::lock_guard<std::mutex> l(mu);
      if (!fixed.empty() && fixed != ip) continue;  // another connector answering a broadcast
      state = st;
      if (addr != ip) {
        logf("found the connector at %s", ip);
        addr = ip;
        g_settings.set("last_pi", Json::of(addr));
      }
      heard_at = mono();
    }
    const double now = mono();
    std::string to;
    bool lost, broadcast;
    {
      std::lock_guard<std::mutex> l(mu);
      lost = now - heard_at > core::LOST_S;
      broadcast = fixed.empty();
      to = addr;
    }
    const std::string q = "CSQ1" + about;
    if (lost && now - asked_at_ > 2) {
      asked_at_ = now;
      if (broadcast) send_to(q, "255.255.255.255");
      if (!to.empty()) send_to(q, to);
    } else if (!lost && !to.empty() && now - told_at_ > core::TELL_S) {
      told_at_ = now;
      send_to(q, to);
    }
  }
  void send(const std::string& data) {
    const std::string to = where();
    if (!to.empty()) send_to(data, to);
  }

 private:
  SOCKET sock_ = INVALID_SOCKET;
  double asked_at_ = -1e9, told_at_ = 0;
  void send_to(const std::string& data, const std::string& ip) {
    sockaddr_in to{};
    to.sin_family = AF_INET;
    to.sin_port = htons(core::PORT);
    if (inet_pton(AF_INET, ip.c_str(), &to.sin_addr) != 1) {
      addrinfo hints{}, *res = nullptr;  // a name typed in rather than an address
      hints.ai_family = AF_INET;
      if (getaddrinfo(ip.c_str(), nullptr, &hints, &res) != 0 || !res) return;
      to.sin_addr = reinterpret_cast<sockaddr_in*>(res->ai_addr)->sin_addr;
      freeaddrinfo(res);
    }
    sendto(sock_, data.data(), int(data.size()), 0, reinterpret_cast<sockaddr*>(&to), sizeof to);
  }
};

// ---------- the loop ----------
class Sync {
 public:
  Link link;
  std::atomic<bool> paused{false}, stop{false}, gaming{false}, gaming_paused{false}, black{false};
  std::atomic<double> fps{20}, resume_until{0};
  std::mutex mu;
  std::string want;        // the display asked for ("" the main one)
  bool want_new = true;
  std::vector<Display> displays;  // as last looked up (every few seconds, off the tray's thread)
  std::string display;     // the one being followed

  void set_display(const std::string& id, double at) {
    {
      std::lock_guard<std::mutex> l(mu);
      want = id;
      want_new = true;
    }
    g_settings.set("display", id.empty() ? Json() : Json::of(id));
    g_settings.set("display_at", Json::of(at));
    link.tell_soon();
  }
  void resume_room() { paused = false; resume_until = mono() + 1.0; }
  std::string status() {
    return core::status_line(paused, gaming_paused, gaming, black, link.found(), link.where(), link.last());
  }
  std::vector<Display> shown() { std::lock_guard<std::mutex> l(mu); return displays; }
  std::string following() {
    std::lock_guard<std::mutex> l(mu);
    for (const auto& d : displays) if (d.id == want) return want;
    for (const auto& d : displays) if (d.main) return d.id;
    return displays.empty() ? "" : displays[0].id;
  }

  void run() {
#if CASETA_WGC
    try { winrt::init_apartment(winrt::apartment_type::multi_threaded); } catch (...) {}
#endif
    Capture cap;
    core::Cells cells{}, last{};
    bool have = false;
    double next = mono(), rate = fps, rate_at = -1e9, still_from = next, black_from = -1, opened_at = -1e9, listed_at = -1e9;
    double noted_at = next;
    long long sent = 0, noted_sent = 0;
    bool was_found = false;
    const std::string me = hostname();
    while (!stop) {
      const double now = mono();
      if (now - rate_at > 2) {  // what is in front is looked at every two seconds, not every frame
        rate_at = now;
        const bool g = game_in_front();
        const std::string mode = g_settings.game();
        gaming = g && (mode == "gentle" || mode == "pause");
        gaming_paused = g && mode == "pause";
        rate = gaming_paused ? 0.0 : (g && mode == "gentle") ? core::GAME_RATE : double(fps);
      }
      if (now - listed_at > 5) {
        listed_at = now;
        auto ds = list_displays();
        std::lock_guard<std::mutex> l(mu);
        displays = ds;
      }
      Json about = Json::object();
      about.o["name"] = Json::of(me);
      about.o["os"] = Json::of(std::string("windows"));
      about.o["v"] = Json::of(std::string(VERSION));
      about.o["displays"] = displays_json(shown());
      about.o["display"] = display.empty() ? Json() : Json::of(display);
      // how it is looking, and what it last saw, for the connector's log: "the lights stay dark" can be read from there
      char seen[8];
      long long avg[3] = {0, 0, 0};
      for (int i = 0; i < core::CELLS; i++) avg[i % 3] += last[i];
      snprintf(seen, sizeof seen, "#%02x%02x%02x", int(avg[0] / 144), int(avg[1] / 144), int(avg[2] / 144));
      about.o["capture"] = Json::of(cap.is_open() ? cap.describe() + ", saw " + seen : std::string("not looking"));
      link.tick(about.dump());
      // the display picked in the app, when that choice is newer than the last one made here
      std::string id;
      double at = 0;
      if (core::wanted_display(link.last(), me, g_settings.num("display_at", 0), id, at)) {
        logf("the app picked display %s", id.empty() ? "(main)" : id.c_str());
        set_display(id, at);
      }
      const bool found = link.found();
      if (found != was_found) {
        was_found = found;
        const std::string w = link.where();
        if (found || !w.empty()) logf("the connector %s%s%s", found ? "is answering" : "stopped answering (", found ? "" : w.c_str(), found ? "" : ")");
      }
      if (now - noted_at >= 600) {
        logf("running: %lld frames in %.0f min, %.0f a second, memory %zu MB (peak %zu MB)", sent - noted_sent, (now - noted_at) / 60, rate,
             memory_mb(false), memory_mb(true));
        noted_at = now;
        noted_sent = sent;
      }
      if (rate > 0 && !paused) {
        bool reopen;
        std::string asked;
        {
          std::lock_guard<std::mutex> l(mu);
          reopen = want_new;
          asked = want;
          want_new = false;
        }
        if ((reopen || !cap.is_open()) && now - opened_at > (reopen ? 0 : 1)) {
          opened_at = now;
          if (cap.open(asked)) display = cap.display;
          if (reopen) have = false;
        }
        const int r = cap.look(cells);
        if (r == 1) {
          if (have && core::moved(cells, last) > 3) still_from = now;
          last = cells;
          have = true;
          const bool dark = core::brightest(cells) < 8;
          black_from = dark ? (black_from < 0 ? now : black_from) : -1;
          black = black_from >= 0 && now - black_from > 5;
        }
        if (have) {  // unchanged is sent again too: the connector takes silence for the computer having gone
          link.send(core::frame_bytes(last, mono() < resume_until));
          sent++;
        }
      } else if (cap.is_open()) {
        cap.close();  // paused, or a game set to pause: nothing held on the graphics card either
      }
      const Json st = link.last();
      const double looking = core::pace(rate, found ? st["state"].str() : "", now - still_from);
      next += 1.0 / (looking > 0 ? looking : 2.0);
      const double wait = next - mono();
      if (wait > 0) std::this_thread::sleep_for(std::chrono::duration<double>(wait));
      if (mono() - next > 1) next = mono();  // the PC slept: start the beat again rather than catch up
    }
    cap.close();
  }
};
static Sync g_sync;

// ---------- starting with Windows ----------
static const wchar_t* RUN_KEY = L"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
static bool starts_with_windows() {
  HKEY k;
  if (RegOpenKeyExW(HKEY_CURRENT_USER, RUN_KEY, 0, KEY_READ, &k) != ERROR_SUCCESS) return false;
  const bool there = RegQueryValueExW(k, APP, nullptr, nullptr, nullptr, nullptr) == ERROR_SUCCESS;
  RegCloseKey(k);
  return there;
}
static void set_start_with_windows(bool on) {
  HKEY k;
  if (RegOpenKeyExW(HKEY_CURRENT_USER, RUN_KEY, 0, KEY_SET_VALUE, &k) != ERROR_SUCCESS) return;
  if (on) {
    wchar_t exe[MAX_PATH];
    GetModuleFileNameW(nullptr, exe, MAX_PATH);
    const std::wstring v = L"\"" + std::wstring(exe) + L"\"";
    RegSetValueExW(k, APP, 0, REG_SZ, reinterpret_cast<const BYTE*>(v.c_str()), DWORD((v.size() + 1) * sizeof(wchar_t)));
  } else {
    RegDeleteValueW(k, APP);
  }
  RegCloseKey(k);
}

// ---------- a page in a small window of its own (Edge's app window), else the default browser ----------
static void open_window(const std::string& url, int w, int h) {
  const std::wstring args = L"--app=" + wide(url) + L" --window-size=" + std::to_wstring(w) + L"," + std::to_wstring(h);
  if (reinterpret_cast<INT_PTR>(ShellExecuteW(nullptr, L"open", L"msedge.exe", args.c_str(), nullptr, SW_SHOWNORMAL)) > 32) return;
  ShellExecuteW(nullptr, L"open", wide(url).c_str(), nullptr, nullptr, SW_SHOWNORMAL);
}
static void open_positions() {
  const std::string url = core::positions_url(g_sync.link.last());
  if (!url.empty()) open_window(url, 1100, 760);
}

// ---------- Settings: pc/settings.html, served on 127.0.0.1 with a token made for the run ----------
static std::string g_token, g_settings_url;

static Json settings_state() {
  Json s = Json::object();
  s.o["status"] = Json::of(g_sync.status());
  s.o["paused"] = Json::of(bool(g_sync.paused));
  s.o["fps"] = Json::of(double(int(g_sync.fps)));
  s.o["game"] = Json::of(g_settings.game());
  const std::string pi = g_settings.str("pi");
  s.o["pi"] = pi.empty() ? Json() : Json::of(pi);
  const std::string w = g_sync.link.where();
  s.o["found"] = w.empty() ? Json() : Json::of(w);
  s.o["login"] = Json::of(starts_with_windows());
  s.o["os"] = Json::of(std::string("windows"));
  s.o["positions"] = Json::of(!core::positions_url(g_sync.link.last()).empty());
  s.o["displays"] = displays_json(g_sync.shown());
  s.o["display"] = Json::of(g_sync.following());
  return s;
}
static void settings_change(const Json& b) {
  if (b["paused"].kind == Json::Bool) { if (b["paused"].b) g_sync.paused = true; else g_sync.resume_room(); }
  if (b["fps"].kind == Json::Number)
    for (int r : core::RATES)
      if (int(b["fps"].n) == r) { g_sync.fps = r; g_settings.set("fps", Json::of(double(r))); }
  const std::string game = b["game"].str();
  if (game == "gentle" || game == "full" || game == "pause") g_settings.set("game", Json::of(game));
  if (b["display"].kind == Json::String) {
    const std::string d = b["display"].s;
    bool known = d.empty();
    for (const auto& x : g_sync.shown()) known = known || x.id == d;
    if (known) g_sync.set_display(d, epoch_ms());
  }
  if (b["pi"].kind == Json::String || b["pi"].kind == Json::Null) {
    std::string pi = b["pi"].str();
    while (!pi.empty() && pi.back() == ' ') pi.pop_back();
    for (char c : pi) if (!(isalnum(static_cast<unsigned char>(c)) || c == '.' || c == '-' || c == ':')) { pi.clear(); break; }
    g_settings.set("pi", pi.empty() ? Json() : Json::of(pi));
    g_sync.link.set_fixed(pi);
  }
  if (b["login"].kind == Json::Bool) set_start_with_windows(b["login"].b);
}
static void serve_one(SOCKET c) {
  std::string req;
  char buf[4096];
  while (req.find("\r\n\r\n") == std::string::npos && req.size() < 16384) {
    int n = recv(c, buf, sizeof buf, 0);
    if (n <= 0) break;
    req.append(buf, size_t(n));
  }
  const size_t sp1 = req.find(' '), sp2 = req.find(' ', sp1 + 1);
  std::string method = sp1 == std::string::npos ? "" : req.substr(0, sp1);
  std::string target = sp2 == std::string::npos ? "" : req.substr(sp1 + 1, sp2 - sp1 - 1);
  const std::string pre = "/" + g_token + "/";
  int code = 404;
  std::string body, type = "text/plain";
  if (target.compare(0, pre.size(), pre) == 0) {
    std::string path = target.substr(pre.size());
    path = path.substr(0, path.find('?'));
    if (method == "GET" && path.empty()) {
      code = 200; type = "text/html; charset=utf-8";
      body.assign(reinterpret_cast<const char*>(SETTINGS_HTML), SETTINGS_HTML_LEN);
    } else if (method == "GET" && path == "state") {
      code = 200; type = "application/json"; body = settings_state().dump();
    } else if ((method == "GET" || method == "POST") && (path == "set" || path == "positions")) {
      if (path == "set") settings_change(Json::parse(core::query_value(target, "b")));
      else open_positions();
      code = 200; type = "application/json"; body = settings_state().dump();
    }
  }
  const std::string head = "HTTP/1.1 " + std::to_string(code) + (code == 200 ? " OK" : " Not Found") + "\r\nContent-Type: " + type +
                           "\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: " + std::to_string(body.size()) + "\r\n\r\n";
  const std::string out = head + body;
  send(c, out.data(), int(out.size()), 0);
  closesocket(c);
}
static bool start_settings_server() {
  SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (s == INVALID_SOCKET) return false;
  sockaddr_in a{};
  a.sin_family = AF_INET;
  a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (bind(s, reinterpret_cast<sockaddr*>(&a), sizeof a) != 0 || listen(s, 8) != 0) return false;
  int al = sizeof a;
  getsockname(s, reinterpret_cast<sockaddr*>(&a), &al);
  std::random_device rd;  // the system's own randomness on Windows
  static const char* hex = "0123456789abcdef";
  for (int i = 0; i < 24; i++) g_token += hex[rd() & 15];
  g_settings_url = "http://127.0.0.1:" + std::to_string(ntohs(a.sin_port)) + "/" + g_token + "/";
  logf("settings at %s", g_settings_url.c_str());
  std::thread([s] {
    for (;;) {
      SOCKET c = accept(s, nullptr, nullptr);
      if (c == INVALID_SOCKET) continue;
      std::thread(serve_one, c).detach();
    }
  }).detach();
  return true;
}

// ---------- the tray: one still icon, a menu ----------
enum { ID_SETTINGS = 1, ID_POSITIONS, ID_PAUSE, ID_QUIT, ID_DISPLAY = 100 };
static const UINT WM_TRAY = WM_APP + 1;
static UINT g_taskbar_created = 0;
static NOTIFYICONDATAW g_nid{};
static std::wstring g_tip;

// A monitor, drawn once in white: nothing on the tray moves, so it costs nothing while a game runs
static HICON make_icon() {
  const int S = GetSystemMetrics(SM_CXSMICON) > 0 ? GetSystemMetrics(SM_CXSMICON) : 16;
  BITMAPV5HEADER bh{};
  bh.bV5Size = sizeof bh; bh.bV5Width = S; bh.bV5Height = -S; bh.bV5Planes = 1; bh.bV5BitCount = 32; bh.bV5Compression = BI_BITFIELDS;
  bh.bV5RedMask = 0x00FF0000; bh.bV5GreenMask = 0x0000FF00; bh.bV5BlueMask = 0x000000FF; bh.bV5AlphaMask = 0xFF000000;
  void* bits = nullptr;
  HDC dc = GetDC(nullptr);
  HBITMAP color = CreateDIBSection(dc, reinterpret_cast<BITMAPINFO*>(&bh), DIB_RGB_COLORS, &bits, nullptr, 0);
  ReleaseDC(nullptr, dc);
  if (!color || !bits) return LoadIcon(nullptr, IDI_APPLICATION);
  auto* px = static_cast<uint32_t*>(bits);
  const double k = S / 16.0;
  auto put = [&](double x0, double y0, double x1, double y1) {
    for (int y = int(y0 * k); y < int(y1 * k + 0.5); y++)
      for (int x = int(x0 * k); x < int(x1 * k + 0.5); x++)
        if (x >= 0 && y >= 0 && x < S && y < S) px[y * S + x] = 0xFFEEF2EF;
  };
  put(1, 3, 15, 4); put(1, 10.5, 15, 11.5); put(1, 3, 2, 11.5); put(14, 3, 15, 11.5);  // the screen's edge
  put(7, 11.5, 9, 13.5); put(4.5, 13.5, 11.5, 14.5);                                   // its stand
  HBITMAP mask = CreateBitmap(S, S, 1, 1, nullptr);
  ICONINFO ii{};
  ii.fIcon = TRUE; ii.hbmColor = color; ii.hbmMask = mask;
  HICON icon = CreateIconIndirect(&ii);
  DeleteObject(color);
  DeleteObject(mask);
  return icon;
}
static void tray_add(HWND hwnd) {
  g_nid = {};
  g_nid.cbSize = sizeof g_nid;
  g_nid.hWnd = hwnd;
  g_nid.uID = 1;
  g_nid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
  g_nid.uCallbackMessage = WM_TRAY;
  g_nid.hIcon = make_icon();
  lstrcpynW(g_nid.szTip, L"Caseta screen sync", 128);
  Shell_NotifyIconW(NIM_ADD, &g_nid);
}
static void tray_tip() {
  std::wstring tip = wide("Caseta screen sync \xc2\xb7 " + g_sync.status());
  if (tip == g_tip) return;  // only when what it says changes
  g_tip = tip;
  lstrcpynW(g_nid.szTip, tip.c_str(), 128);
  g_nid.uFlags = NIF_TIP;
  Shell_NotifyIconW(NIM_MODIFY, &g_nid);
}
static void show_menu(HWND hwnd) {
  HMENU m = CreatePopupMenu();
  AppendMenuW(m, MF_STRING | MF_GRAYED, 0, wide(g_sync.status()).c_str());
  AppendMenuW(m, MF_STRING, ID_SETTINGS, L"Settings");
  SetMenuDefaultItem(m, ID_SETTINGS, FALSE);
  const auto ds = g_sync.shown();
  if (ds.size() > 1) {
    HMENU sub = CreatePopupMenu();
    const std::string on = g_sync.following();
    for (size_t i = 0; i < ds.size() && i < 50; i++)
      AppendMenuW(sub, MF_STRING | (ds[i].id == on ? MF_CHECKED : 0), ID_DISPLAY + UINT(i), wide(ds[i].name).c_str());
    AppendMenuW(m, MF_POPUP, reinterpret_cast<UINT_PTR>(sub), L"Display");
  }
  AppendMenuW(m, MF_STRING | (core::positions_url(g_sync.link.last()).empty() ? MF_GRAYED : 0), ID_POSITIONS, L"Light positions");
  const bool paused = g_sync.paused || g_sync.link.last()["state"].str() == "paused";
  AppendMenuW(m, MF_STRING, ID_PAUSE, paused ? L"Resume" : L"Pause");
  AppendMenuW(m, MF_STRING, ID_QUIT, L"Quit");
  POINT pt;
  GetCursorPos(&pt);
  SetForegroundWindow(hwnd);
  const UINT cmd = TrackPopupMenu(m, TPM_RETURNCMD | TPM_RIGHTBUTTON | TPM_NONOTIFY, pt.x, pt.y, 0, hwnd, nullptr);
  DestroyMenu(m);
  if (cmd == ID_SETTINGS) open_window(g_settings_url, 400, 620);
  else if (cmd == ID_POSITIONS) open_positions();
  else if (cmd == ID_PAUSE) { if (paused) g_sync.resume_room(); else g_sync.paused = true; }
  else if (cmd == ID_QUIT) DestroyWindow(hwnd);
  else if (cmd >= ID_DISPLAY && cmd < ID_DISPLAY + ds.size()) g_sync.set_display(ds[cmd - ID_DISPLAY].main ? "" : ds[cmd - ID_DISPLAY].id, epoch_ms());
  tray_tip();
}
static LRESULT CALLBACK wnd_proc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  if (msg == g_taskbar_created && g_taskbar_created) { tray_add(hwnd); g_tip.clear(); return 0; }  // Explorer restarted
  switch (msg) {
    case WM_TRAY:
      if (LOWORD(lp) == WM_LBUTTONUP) open_window(g_settings_url, 400, 620);
      else if (LOWORD(lp) == WM_RBUTTONUP || LOWORD(lp) == WM_CONTEXTMENU) show_menu(hwnd);
      return 0;
    case WM_TIMER:
      tray_tip();
      return 0;
    case WM_DESTROY:
      Shell_NotifyIconW(NIM_DELETE, &g_nid);
      PostQuitMessage(0);
      return 0;
  }
  return DefWindowProcW(hwnd, msg, wp, lp);
}

// ---------- staying out of the way ----------
static void run_quietly() {
  SetPriorityClass(GetCurrentProcess(), BELOW_NORMAL_PRIORITY_CLASS);
  // Windows 11's efficiency mode: the process's threads run on the efficient cores at an easy pace
  struct Throttle { ULONG Version, ControlMask, StateMask; } t{1, 1, 1};
  using SetInfo = BOOL(WINAPI*)(HANDLE, int, LPVOID, DWORD);
  if (auto f = reinterpret_cast<SetInfo>(reinterpret_cast<void*>(GetProcAddress(GetModuleHandleW(L"kernel32.dll"), "SetProcessInformation"))))
    f(GetCurrentProcess(), 4 /* ProcessPowerThrottling */, &t, sizeof t);
  using SetDpi = BOOL(WINAPI*)(HANDLE);
  if (auto f = reinterpret_cast<SetDpi>(reinterpret_cast<void*>(GetProcAddress(GetModuleHandleW(L"user32.dll"), "SetProcessDpiAwarenessContext"))))
    f(reinterpret_cast<HANDLE>(-4) /* per monitor v2 */);
}

// ---------- --selftest: look at the screen, say what it saw and what it cost ----------
static int selftest() {
#if CASETA_WGC
  try { winrt::init_apartment(winrt::apartment_type::multi_threaded); } catch (...) {}
#endif
  Capture cap;
  core::Cells cells{};
  const double t0 = mono();
  int got = 0;
  if (cap.open("")) for (int i = 0; i < 40 && got != 1; i++) got = cap.look(cells, 50);
  const double first = (mono() - t0) * 1000;
  const size_t before = memory_mb(true);
  const double t1 = mono();
  for (int i = 0; i < 300; i++) cap.look(cells, 0);
  const double each = (mono() - t1) / 300 * 1000;
  long long sum[3] = {0, 0, 0};
  for (int i = 0; i < core::CELLS; i++) sum[i % 3] += cells[i];
  Json out = Json::object();
  out.o["capture"] = Json::of(got == 1 ? cap.describe() : std::string("none"));
  out.o["displays"] = displays_json(list_displays());
  Json sample = Json::array();
  sample.a.push_back(Json::of(double(cap.sh)));
  sample.a.push_back(Json::of(double(cap.sw)));
  out.o["sample"] = sample;
  Json avg = Json::array();
  for (long long v : sum) avg.a.push_back(Json::of(double(v / (core::CELLS / 3))));
  out.o["average"] = avg;
  out.o["ms_first"] = Json::of(std::round(first * 10) / 10);
  out.o["ms_each"] = Json::of(std::round(each * 1000) / 1000);
  out.o["memory_mb"] = Json::of(double(memory_mb(true)));
  out.o["memory_grew_mb"] = Json::of(double(memory_mb(true) - before));
  const std::string text = out.dump() + "\n";
  HANDLE h = GetStdHandle(STD_OUTPUT_HANDLE);
  DWORD w = 0;
  if (!(h && h != INVALID_HANDLE_VALUE && WriteFile(h, text.data(), DWORD(text.size()), &w, nullptr))) write_file(L"selftest.json", text);
  return got == 1 ? 0 : 1;
}

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE, PWSTR, int) {
  WSADATA wsa;
  WSAStartup(MAKEWORD(2, 2), &wsa);
  int argc = 0;
  LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  std::string pi;
  bool open_settings = false;
  for (int i = 1; i < argc; i++) {
    const std::wstring a = argv[i];
    if (a == L"--wgc") g_force_wgc = true;
    if (a == L"--settings") open_settings = true;
    if (a == L"--pi" && i + 1 < argc) pi = narrow(argv[++i]);
  }
  for (int i = 1; i < argc; i++) if (std::wstring(argv[i]) == L"--selftest") return selftest();
  g_log_path = env_dir(L"LOCALAPPDATA") + L"\\log.txt";
  // one copy at a time (the earlier app took the same port, so the two never run together either)
  SOCKET lock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
  sockaddr_in la{};
  la.sin_family = AF_INET;
  la.sin_port = htons(core::PORT + 1);
  la.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  BOOL excl = TRUE;
  setsockopt(lock, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, reinterpret_cast<const char*>(&excl), sizeof excl);
  if (bind(lock, reinterpret_cast<sockaddr*>(&la), sizeof la) != 0) { logf("already running"); return 0; }
  run_quietly();
  g_settings.load();
  double fps = g_settings.num("fps", 20);
  g_sync.fps = std::max(5.0, std::min(240.0, fps));
  g_sync.want = g_settings.str("display");
  if (pi.empty()) pi = g_settings.str("pi");
  g_sync.link.start();
  if (!pi.empty()) g_sync.link.set_fixed(pi);
  else if (!g_settings.str("last_pi").empty()) g_sync.link.addr = g_settings.str("last_pi");
  start_settings_server();
  logf("screen sync %s started (native, %.0f a second, connector %s)", VERSION, double(g_sync.fps),
       g_sync.link.where().empty() ? "to be found" : g_sync.link.where().c_str());

  WNDCLASSW wc{};
  wc.lpfnWndProc = wnd_proc;
  wc.hInstance = inst;
  wc.lpszClassName = APP;
  RegisterClassW(&wc);
  HWND hwnd = CreateWindowExW(0, APP, APP, 0, 0, 0, 0, 0, nullptr, nullptr, inst, nullptr);
  g_taskbar_created = RegisterWindowMessageW(L"TaskbarCreated");
  tray_add(hwnd);
  SetTimer(hwnd, 1, 2000, nullptr);
  std::thread worker([] { g_sync.run(); });
  if (open_settings) open_window(g_settings_url, 400, 620);
  MSG msg;
  while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }
  g_sync.stop = true;
  worker.join();
  logf("quit");
  return 0;
}
