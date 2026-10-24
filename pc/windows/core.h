// Caseta screen sync for Windows: the parts with nothing of Windows in them, so they are tested anywhere
// (test_core.cpp). What the screen becomes (a 16 x 9 grid of colours, black bars left out), how often to look, the
// datagrams the connector hears, and the little JSON the two sides speak. The same rules as the Mac app
// (pc/mac/Core.swift) and the connector's own reading of them (agent/screensync.py).
#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace core {

constexpr int PORT = 47700;
constexpr int GRID_W = 16, GRID_H = 9;
constexpr int CELLS = GRID_W * GRID_H * 3;
constexpr int RATES[] = {12, 20, 30, 60, 120, 240};  // Settings' choices
constexpr double GAME_RATE = 6;      // "gently", while a game fills the screen
constexpr double STANDBY_RATE = 1;   // the room not following: a glance a second keeps the Pi aware of the computer
constexpr double STILL_RATE = 4;     // nothing on the screen has moved for a second: look this often until it does
constexpr double STILL_AFTER_S = 1;
constexpr double LOST_S = 10;        // no answer from the connector for this long: look for it again
constexpr double TELL_S = 10;        // and how often, while it answers, this computer says which displays it has
constexpr uint8_t FLAG_RESUME = 0x01;

using Cells = std::array<uint8_t, CELLS>;

// ---------- the screen, as the lights see it ----------
// A picture `w` x `h`, `stride` bytes a row, 4 bytes a pixel in B, G, R, A order (as Windows and macOS hold a
// screen). Looked at about 10 x 10 pixels for every cell; rows and then columns at the edges that are black all the
// way along (a film's bars) are left out, up to a quarter of the picture from each side; a picture black all over is
// kept whole, so it reads as black.
inline Cells grid(const uint8_t* px, int w, int h, int stride) {
  Cells out{};
  if (!px || w <= 0 || h <= 0) return out;
  const int sy = std::max(1, h / (GRID_H * 10)), sx = std::max(1, w / (GRID_W * 10));
  const int H = (h + sy - 1) / sy, W = (w + sx - 1) / sx;
  std::vector<float> rgb(static_cast<size_t>(H) * W * 3);
  std::vector<float> lum(static_cast<size_t>(H) * W);
  for (int y = 0; y < H; y++) {
    const uint8_t* row = px + static_cast<size_t>(y) * sy * stride;
    for (int x = 0; x < W; x++) {
      const uint8_t* p = row + static_cast<size_t>(x) * sx * 4;
      float* c = &rgb[(static_cast<size_t>(y) * W + x) * 3];
      c[0] = p[2]; c[1] = p[1]; c[2] = p[0];
      lum[static_cast<size_t>(y) * W + x] = std::max({c[0], c[1], c[2]});
    }
  }
  const float dark = 10.f;
  std::vector<bool> r(H, false), cl(W, false);
  for (int y = 0; y < H; y++)
    for (int x = 0; x < W; x++)
      if (lum[static_cast<size_t>(y) * W + x] > dark) { r[y] = true; cl[x] = true; }
  int top = 0, bot = 0, lef = 0, rig = 0;
  if (std::find(r.begin(), r.end(), true) != r.end()) {
    auto first = [](const std::vector<bool>& v) { for (size_t i = 0; i < v.size(); i++) if (v[i]) return int(i); return 0; };
    auto last = [](const std::vector<bool>& v) { for (size_t i = 0; i < v.size(); i++) if (v[v.size() - 1 - i]) return int(i); return 0; };
    top = std::min(first(r), int(H * 0.25)); bot = std::min(last(r), int(H * 0.25));
    lef = std::min(first(cl), int(W * 0.25)); rig = std::min(last(cl), int(W * 0.25));
  }
  const int h2 = H - top - bot, w2 = W - lef - rig;
  const int rows = h2 / GRID_H * GRID_H, cols = w2 / GRID_W * GRID_W;
  if (rows < GRID_H || cols < GRID_W) return out;
  const int bh = rows / GRID_H, bw = cols / GRID_W;
  for (int gy = 0; gy < GRID_H; gy++)
    for (int gx = 0; gx < GRID_W; gx++) {
      double s[3] = {0, 0, 0};
      for (int y = 0; y < bh; y++)
        for (int x = 0; x < bw; x++) {
          const float* c = &rgb[(static_cast<size_t>(top + gy * bh + y) * W + (lef + gx * bw + x)) * 3];
          s[0] += c[0]; s[1] += c[1]; s[2] += c[2];
        }
      for (int k = 0; k < 3; k++) {
        const double v = s[k] / (bh * bw);
        out[(gy * GRID_W + gx) * 3 + k] = static_cast<uint8_t>(std::clamp(v, 0.0, 255.0));
      }
    }
  return out;
}

// ---------- an HDR screen ----------
// Windows hands over an HDR screen as 16-bit floats a channel (R, G, B, A), linear light where 1.0 is 80 nits. `scale`
// is what brings the screen's own SDR white (Settings' "SDR content brightness") to 1.0; brighter than that is the
// brightest the lights show. Turned into the B, G, R, A bytes grid() reads, at the picture's own size.
inline float half(uint16_t h) {
  const int e = (h >> 10) & 31, m = h & 1023;
  const float v = e == 0 ? std::ldexp(float(m), -24) : e == 31 ? 0.f : std::ldexp(float(m | 1024), e - 25);
  return (h & 0x8000) ? -v : v;
}
inline std::vector<uint8_t> scrgb_to_bgra(const uint8_t* px, int w, int h, int stride, float scale) {
  static const std::array<uint8_t, 4097> enc = [] {  // linear 0..1 in 4096 steps to sRGB
    std::array<uint8_t, 4097> t{};
    for (int i = 0; i <= 4096; i++) {
      const double v = i / 4096.0;
      const double e = v <= 0.0031308 ? v * 12.92 : 1.055 * std::pow(v, 1 / 2.4) - 0.055;
      t[size_t(i)] = static_cast<uint8_t>(std::lround(std::clamp(e, 0.0, 1.0) * 255));
    }
    return t;
  }();
  std::vector<uint8_t> out(static_cast<size_t>(w) * h * 4);
  for (int y = 0; y < h; y++) {
    const uint16_t* row = reinterpret_cast<const uint16_t*>(px + static_cast<size_t>(y) * stride);
    uint8_t* o = &out[static_cast<size_t>(y) * w * 4];
    for (int x = 0; x < w; x++) {
      for (int k = 0; k < 3; k++) {
        const float v = std::clamp(half(row[x * 4 + k]) * scale, 0.f, 1.f);
        o[x * 4 + (2 - k)] = enc[size_t(v * 4096 + 0.5f)];  // R, G, B in; B, G, R out
      }
      o[x * 4 + 3] = 255;
    }
  }
  return out;
}

inline std::string frame_bytes(const Cells& cells, bool resume) {
  std::string f = "CSY1";
  f += static_cast<char>(resume ? FLAG_RESUME : 0);
  f += static_cast<char>(GRID_W);
  f += static_cast<char>(GRID_H);
  f.append(reinterpret_cast<const char*>(cells.data()), cells.size());
  return f;
}

// How far two looks differ: the largest change in any colour of any cell
inline int moved(const Cells& a, const Cells& b) {
  int m = 0;
  for (size_t i = 0; i < a.size(); i++) m = std::max(m, std::abs(int(a[i]) - int(b[i])));
  return m;
}
inline int brightest(const Cells& a) { return *std::max_element(a.begin(), a.end()); }

// How often to look now: `rate` while the room is following and the screen moves; a glance a second while the Pi says
// the room is not following (off, paused, or stuck on a problem); STILL_RATE once nothing has moved for STILL_AFTER_S.
// While the Pi has not answered, whether the room follows is not known, so the full rate stands.
inline double pace(double rate, const std::string& room_state, double still_for) {
  if (rate <= 0) return 0;
  if (room_state == "off" || room_state == "paused" || room_state == "problem") return std::min(rate, STANDBY_RATE);
  if (still_for >= STILL_AFTER_S) return std::min(rate, STILL_RATE);
  return rate;
}

// ---------- JSON, the little of it the connector and the settings file use ----------
struct Json {
  enum Kind { Null, Bool, Number, String, Array, Object } kind = Null;
  bool b = false;
  double n = 0;
  std::string s;
  std::vector<Json> a;
  std::map<std::string, Json> o;

  Json() = default;
  static Json of(bool v) { Json j; j.kind = Bool; j.b = v; return j; }
  static Json of(double v) { Json j; j.kind = Number; j.n = v; return j; }
  static Json of(const std::string& v) { Json j; j.kind = String; j.s = v; return j; }
  static Json object() { Json j; j.kind = Object; return j; }
  static Json array() { Json j; j.kind = Array; return j; }

  const Json& operator[](const std::string& k) const {
    static const Json none;
    if (kind != Object) return none;
    auto it = o.find(k);
    return it == o.end() ? none : it->second;
  }
  std::string str(const std::string& dflt = "") const { return kind == String ? s : dflt; }
  double num(double dflt = 0) const { return kind == Number ? n : dflt; }
  bool is_null() const { return kind == Null; }

  static Json parse(const std::string& text, bool* ok = nullptr) {
    size_t i = 0;
    bool good = true;
    Json j = value(text, i, good, 0);
    skip(text, i);
    if (i != text.size()) good = false;
    if (ok) *ok = good;
    return good ? j : Json();
  }

  std::string dump() const {
    switch (kind) {
      case Null: return "null";
      case Bool: return b ? "true" : "false";
      case Number: {
        if (std::isfinite(n) && std::floor(n) == n && std::fabs(n) < 9e15) return std::to_string(static_cast<long long>(n));
        char buf[32];
        std::snprintf(buf, sizeof buf, "%.17g", std::isfinite(n) ? n : 0.0);  // exact: a time in ms has to read back as itself
        return buf;
      }
      case String: return quote(s);
      case Array: {
        std::string out = "[";
        for (size_t i = 0; i < a.size(); i++) out += (i ? "," : "") + a[i].dump();
        return out + "]";
      }
      case Object: {
        std::string out = "{";
        bool first = true;
        for (const auto& kv : o) { out += (first ? "" : ",") + quote(kv.first) + ":" + kv.second.dump(); first = false; }
        return out + "}";
      }
    }
    return "null";
  }

  static std::string quote(const std::string& v) {
    std::string out = "\"";
    for (unsigned char c : v) {
      switch (c) {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
          if (c < 0x20) { char buf[8]; std::snprintf(buf, sizeof buf, "\\u%04x", c); out += buf; }
          else out += static_cast<char>(c);
      }
    }
    return out + "\"";
  }

 private:
  static void skip(const std::string& t, size_t& i) { while (i < t.size() && (t[i] == ' ' || t[i] == '\n' || t[i] == '\r' || t[i] == '\t')) i++; }
  static void utf8(std::string& out, unsigned cp) {
    if (cp < 0x80) out += static_cast<char>(cp);
    else if (cp < 0x800) { out += static_cast<char>(0xC0 | (cp >> 6)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
    else if (cp < 0x10000) { out += static_cast<char>(0xE0 | (cp >> 12)); out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
    else { out += static_cast<char>(0xF0 | (cp >> 18)); out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F)); out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
  }
  static bool hex4(const std::string& t, size_t i, unsigned& v) {
    if (i + 4 > t.size()) return false;
    v = 0;
    for (size_t k = i; k < i + 4; k++) {
      char c = t[k];
      v <<= 4;
      if (c >= '0' && c <= '9') v |= unsigned(c - '0');
      else if (c >= 'a' && c <= 'f') v |= unsigned(c - 'a' + 10);
      else if (c >= 'A' && c <= 'F') v |= unsigned(c - 'A' + 10);
      else return false;
    }
    return true;
  }
  static std::string string_at(const std::string& t, size_t& i, bool& good) {
    std::string out;
    i++;  // the opening quote
    while (i < t.size() && t[i] != '"') {
      char c = t[i++];
      if (c != '\\') { out += c; continue; }
      if (i >= t.size()) { good = false; return out; }
      char e = t[i++];
      switch (e) {
        case 'n': out += '\n'; break;
        case 't': out += '\t'; break;
        case 'r': out += '\r'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'u': {
          unsigned cp;
          if (!hex4(t, i, cp)) { good = false; return out; }
          i += 4;
          if (cp >= 0xD800 && cp < 0xDC00 && i + 6 <= t.size() && t[i] == '\\' && t[i + 1] == 'u') {
            unsigned lo;
            if (hex4(t, i + 2, lo) && lo >= 0xDC00 && lo < 0xE000) { cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00); i += 6; }
          }
          utf8(out, cp);
          break;
        }
        default: out += e;
      }
    }
    if (i >= t.size()) { good = false; return out; }
    i++;  // the closing quote
    return out;
  }
  static Json value(const std::string& t, size_t& i, bool& good, int depth) {
    skip(t, i);
    if (!good || i >= t.size() || depth > 32) { good = false; return Json(); }
    char c = t[i];
    if (c == '{') {
      Json j = object();
      i++;
      skip(t, i);
      if (i < t.size() && t[i] == '}') { i++; return j; }
      while (good) {
        skip(t, i);
        if (i >= t.size() || t[i] != '"') { good = false; break; }
        std::string k = string_at(t, i, good);
        skip(t, i);
        if (i >= t.size() || t[i] != ':') { good = false; break; }
        i++;
        j.o[k] = value(t, i, good, depth + 1);
        skip(t, i);
        if (i < t.size() && t[i] == ',') { i++; continue; }
        if (i < t.size() && t[i] == '}') { i++; break; }
        good = false;
      }
      return j;
    }
    if (c == '[') {
      Json j = array();
      i++;
      skip(t, i);
      if (i < t.size() && t[i] == ']') { i++; return j; }
      while (good) {
        j.a.push_back(value(t, i, good, depth + 1));
        skip(t, i);
        if (i < t.size() && t[i] == ',') { i++; continue; }
        if (i < t.size() && t[i] == ']') { i++; break; }
        good = false;
      }
      return j;
    }
    if (c == '"') return of(string_at(t, i, good));
    if (t.compare(i, 4, "true") == 0) { i += 4; return of(true); }
    if (t.compare(i, 5, "false") == 0) { i += 5; return of(false); }
    if (t.compare(i, 4, "null") == 0) { i += 4; return Json(); }
    char* end = nullptr;
    double v = std::strtod(t.c_str() + i, &end);
    if (end == t.c_str() + i) { good = false; return Json(); }
    i = static_cast<size_t>(end - t.c_str());
    return of(v);
  }
};

// The text after "?b=" in a request's address, decoded: how the Settings page sends a change
inline std::string query_value(const std::string& target, const std::string& key) {
  size_t q = target.find('?');
  if (q == std::string::npos) return "";
  std::string rest = target.substr(q + 1);
  size_t at = 0;
  while (at <= rest.size()) {
    size_t amp = rest.find('&', at);
    std::string part = rest.substr(at, amp == std::string::npos ? std::string::npos : amp - at);
    if (part.compare(0, key.size() + 1, key + "=") == 0) {
      std::string v = part.substr(key.size() + 1), out;
      for (size_t i = 0; i < v.size(); i++) {
        if (v[i] == '%' && i + 2 < v.size()) {
          out += static_cast<char>(std::strtol(v.substr(i + 1, 2).c_str(), nullptr, 16));
          i += 2;
        } else out += v[i] == '+' ? ' ' : v[i];
      }
      return out;
    }
    if (amp == std::string::npos) break;
    at = amp + 1;
  }
  return "";
}

// What the menu says the room is doing, from what the connector last said (its state JSON) and this computer's own
inline std::string status_line(bool paused, bool gaming_paused, bool gaming, bool black, bool found, const std::string& addr,
                               const Json& st) {
  if (paused) return "Paused";
  if (gaming_paused) return "Paused while a game is full screen";
  if (black && st["state"].str() == "syncing") return "The screen looks black (protected video like Netflix can't be read)";
  if (!found) return addr.empty() ? "Looking for the connector" : "Sending to " + addr + ", no answer yet";
  const std::string room = st["room_name"].str().empty() ? "No room" : st["room_name"].str();
  const std::string state = st["state"].str();
  if (state == "off") return "Choose a room in the app";
  if (state == "syncing") return room + " \xc2\xb7 following" + (gaming ? " gently" : "");
  if (state == "paused") return room + " \xc2\xb7 paused";
  if (state == "problem") return room + " \xc2\xb7 " + (st["why"].str().empty() ? "not following" : st["why"].str());
  return room + " \xc2\xb7 starting";
}

// The app's positions page for the room that follows, when the connector has said where the app is
inline std::string positions_url(const Json& st) {
  const std::string app = st["app_url"].str(), room = st["room"].str();
  if (app.empty() || room.empty()) return "";
  return app + "#screen/" + room;
}

// The display picked in the app (the connector's "want_display"), when it is meant for this computer and is newer
// than the last choice made here: its id ("" for the main display), else nothing
inline bool wanted_display(const Json& st, const std::string& me, double picked_at, std::string& id, double& at) {
  const Json& w = st["want_display"];
  if (w.kind != Json::Object || w["at"].kind != Json::Number) return false;
  if (!w["pc"].str().empty() && w["pc"].str() != me) return false;
  if (w["at"].n <= picked_at) return false;
  id = w["id"].str();
  at = w["at"].n;
  return true;
}

}  // namespace core
