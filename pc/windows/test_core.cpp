// The Windows app's core (core.h): what it makes of a screen, how often it looks, and what it says to the connector.
// Builds anywhere: g++ -std=c++17 pc/windows/test_core.cpp -o test_core && ./test_core
#include "core.h"

#include <iostream>

using namespace core;
static int fails = 0;
template <class A, class B>
static void check(const char* name, const A& got, const B& want) {
  const bool ok = got == want;
  std::cout << (ok ? "ok   " : "FAIL ") << name << "\n";
  if (!ok) fails++;
}

// a w x h picture in BGRA, every pixel the colour given
struct Pic {
  int w, h;
  std::vector<uint8_t> px;
  Pic(int w_, int h_) : w(w_), h(h_), px(size_t(w_) * h_ * 4, 0) {}
  void fill(int x0, int y0, int x1, int y1, uint8_t r, uint8_t g, uint8_t b) {
    for (int y = y0; y < y1; y++)
      for (int x = x0; x < x1; x++) { uint8_t* p = &px[(size_t(y) * w + x) * 4]; p[0] = b; p[1] = g; p[2] = r; p[3] = 255; }
  }
  Cells cells() const { return grid(px.data(), w, h, w * 4); }
};
static bool all(const Cells& c, int x0, int x1, int r, int g, int b, int slack = 0) {
  for (int y = 0; y < GRID_H; y++)
    for (int x = x0; x < x1; x++) {
      const uint8_t* p = &c[(y * GRID_W + x) * 3];
      if (std::abs(p[0] - r) > slack || std::abs(p[1] - g) > slack || std::abs(p[2] - b) > slack) return false;
    }
  return true;
}

int main() {
  // left half red, right half blue, at 1080p and as the GPU hands it over (240 x 135)
  for (auto [w, h] : {std::pair{1920, 1080}, std::pair{240, 135}}) {
    Pic p(w, h);
    p.fill(0, 0, w / 2, h, 255, 0, 0);
    p.fill(w / 2, 0, w, h, 0, 0, 255);
    const Cells c = p.cells();
    check("its left half is red", all(c, 0, 8, 255, 0, 0), true);
    check("its right half is blue", all(c, 8, 16, 0, 0, 255), true);
  }
  {  // a film with black bars above and below
    Pic p(3840, 2160);
    p.fill(0, 280, 3840, 2160 - 280, 200, 120, 40);
    check("black bars above and below are left out (4K)", all(p.cells(), 0, 16, 200, 120, 40, 1), true);
  }
  {  // and beside it
    Pic p(1920, 1080);
    p.fill(240, 0, 1920 - 240, 1080, 30, 200, 90);
    check("black bars beside it are left out", all(p.cells(), 0, 16, 30, 200, 90, 1), true);
  }
  {
    Pic p(1920, 1080);
    check("a black screen is black", all(p.cells(), 0, 16, 0, 0, 0), true);
    check("and it says so", brightest(p.cells()), 0);
  }
  {
    Pic p(1333, 1017);
    p.fill(0, 0, 1333, 1017, 77, 77, 77);
    check("an odd size still makes a full grid", all(p.cells(), 0, 16, 77, 77, 77), true);
  }
  {
    Pic p(8, 4);
    check("a picture too small for a grid is black", brightest(p.cells()), 0);
  }
  {  // an HDR screen: 16-bit floats, linear, 1.0 = 80 nits; its SDR white at 200 nits (2.5) is the lights' white
    const int w = 240, h = 135;
    std::vector<uint16_t> f(size_t(w) * h * 4, 0);
    auto put = [&](int x0, int x1, float r, float g, float b) {
      auto to_half = [](float v) -> uint16_t {  // enough of the conversion for these values
        if (v <= 0) return 0;
        int e;
        const float m = std::frexp(v, &e);  // v = m * 2^e, m in [0.5, 1)
        return static_cast<uint16_t>(((e + 14) << 10) | (int((m * 2 - 1) * 1024) & 1023));
      };
      for (int y = 0; y < h; y++)
        for (int x = x0; x < x1; x++) { uint16_t* p = &f[(size_t(y) * w + x) * 4]; p[0] = to_half(r); p[1] = to_half(g); p[2] = to_half(b); p[3] = to_half(1); }
    };
    put(0, w / 2, 2.5f, 0, 0);
    put(w / 2, w, 0, 0, 0.5f);
    check("a half float reads back", half(0x3C00), 1.0f);
    const auto bgra = scrgb_to_bgra(reinterpret_cast<const uint8_t*>(f.data()), w, h, w * 8, 1 / 2.5f);
    const Cells c = grid(bgra.data(), w, h, w * 4);
    check("an HDR screen's SDR white red is full red", all(c, 0, 8, 255, 0, 0), true);
    check("and a dimmer blue is a dimmer blue, as sRGB", all(c, 8, 16, 0, 0, 124, 2), true);
  }
  Cells z{};
  const std::string fr = frame_bytes(z, true);
  check("a frame says what it is", fr.substr(0, 4) + char('0' + fr[4]) + std::to_string(int(fr[5])) + "x" + std::to_string(int(fr[6])), std::string("CSY11") + "16x9");
  check("and is the grid after that", fr.size(), size_t(7 + 432));

  check("following, the screen moving: as asked", pace(30, "syncing", 0.2), 30.0);
  check("the room off in the app: a glance a second", pace(30, "off", 0), 1.0);
  check("paused by a hand on a light: the same", pace(240, "paused", 0), 1.0);
  check("nothing on the screen moving: a few a second", pace(60, "syncing", 2), 4.0);
  check("no answer from the Pi: as asked", pace(30, "", 0), 30.0);
  check("a game set to pause: not at all", pace(0, "syncing", 0), 0.0);
  check("a gentle rate is not raised by a still screen", pace(2, "syncing", 5), 2.0);

  bool ok = false;
  Json st = Json::parse(R"({"state":"syncing","room_name":"Collin Office","room":"r1","app_url":"https://hub.example/",
    "pc":{"displays":[{"id":"d0.0","name":"Display 1 · 2560 x 1440","main":true}]},"fps":49.5,"why":null,
    "want_display":{"id":"d0.1","at":1761264000000,"pc":"DESK"}})", &ok);
  check("the connector's answer reads", ok, true);
  check("its state", st["state"].str(), std::string("syncing"));
  check("a name with a middle dot", st["pc"]["displays"].a[0]["name"].str(), std::string("Display 1 \xc2\xb7 2560 x 1440"));
  check("a number", st["fps"].num(), 49.5);
  check("the menu says what the room is doing", status_line(false, false, false, false, true, "", st), std::string("Collin Office \xc2\xb7 following"));
  check("and when the screen is black", status_line(false, false, false, true, true, "", st).find("protected video") != std::string::npos, true);
  check("with no answer, where it is sending", status_line(false, false, false, false, false, "192.168.1.92", Json()), std::string("Sending to 192.168.1.92, no answer yet"));
  check("the positions page", positions_url(st), std::string("https://hub.example/#room/r1/screen"));
  std::string id; double at = 0;
  check("a display picked in the app for another computer is not this one's", wanted_display(st, "OTHER", 0, id, at), false);
  check("one for this computer, newer than the last pick here, is", wanted_display(st, "DESK", 5, id, at) && id == "d0.1" && at == 1761264000000.0, true);
  check("an older one is not", wanted_display(st, "DESK", 1761264000001.0, id, at), false);
  bool bad = true;
  Json::parse("{\"a\":", &bad);
  check("a broken answer is not read", bad, false);

  Json q = Json::object();
  q.o["name"] = Json::of(std::string("DESK \"1\""));
  q.o["v"] = Json::of(std::string("2.0"));
  q.o["at"] = Json::of(1761264000000.0);
  check("what it says of itself is JSON", q.dump(), std::string(R"({"at":1761264000000,"name":"DESK \"1\"","v":"2.0"})"));
  check("and reads back", Json::parse(q.dump())["name"].str(), std::string("DESK \"1\""));
  check("a time with a fraction of a millisecond reads back as itself", Json::parse(Json::of(1792810123456.789).dump()).n, 1792810123456.789);
  check("a change from the Settings page", query_value("/tok/set?b=%7B%22fps%22%3A12%7D", "b"), std::string("{\"fps\":12}"));
  check("and nothing when there is none", query_value("/tok/state", "b"), std::string(""));

  std::cout << (fails ? "FAILED" : "ALL OK") << "\n";
  return fails ? 1 : 0;
}
