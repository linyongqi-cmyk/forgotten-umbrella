// Historical weather lookup for a record's photo (用户 T3 天气联动).
//
// Given a lat/lon and the photo's capture time, fetch the 24 hours of weather
// LEADING UP TO that moment from Open-Meteo's free archive API (no API key).
// The result is stored on the record (record.weather) at edit time — the public
// site is a static build and never calls the API itself.
//
// Returned shape:
//   {
//     source: "open-meteo",
//     fetchedAt: "<ISO>",           // when we fetched it
//     lat, lon,
//     referenceTime: "<photo time>",// the moment treated as hour 0
//     hourly: [ { time: "YYYY-MM-DDTHH:00", code: <WMO>, temp: <°C> }, ... ]
//   }
// hourly holds 25 points: -24h .. 0h at the photo's hour (Asia/Tokyo wall clock).

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Parse a wall-clock timestamp into its numeric parts. Accepts ISO
// ("YYYY-MM-DDTHH:MM"), slashes ("YYYY/MM/DD HH:MM") AND the loose dotted style the
// contributed umbrellas use ("2026.05.02, 19:56", "2026.04.23, around 18:00").
// Needs BOTH a full date and a time-of-day; returns null otherwise (e.g. "2024.10"
// or a date with no HH:MM — we never fabricate an hour, so those are skipped).
function parseWallClock(value) {
  const s = String(value || "");
  const dm = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  const tm = s.match(/(\d{1,2}):(\d{2})/);
  if (!dm || !tm) {
    return null;
  }
  return { y: +dm[1], mo: +dm[2], d: +dm[3], h: +tm[1], mi: +tm[2] };
}

// Format a UTC-anchored Date as the API's "YYYY-MM-DDTHH:00" hour string. We
// anchor everything in UTC purely as fixed wall-clock arithmetic (no host-TZ
// drift); the strings line up with the API's Asia/Tokyo `time` values.
function hourKey(date) {
  return (
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}:00`
  );
}

// hoursBefore = 多少小时的历史（含拍摄当时那一点）。主图=24（画横轴），补充/细节图
// 传 0（只要拍摄当时那 1 个点，显示单个天气图例）。
export async function fetchWeatherData(lat, lon, referenceTime, { fetchImpl = fetch, hoursBefore = 24 } = {}) {
  const ref = parseWallClock(referenceTime);
  if (!ref) {
    throw new Error(`看不懂的时间格式：「${referenceTime}」`);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("坐标无效，无法查天气。");
  }
  const span = Math.max(0, Math.round(Number(hoursBefore) || 0));

  // Anchor at the photo's hour (drop minutes), then enumerate -span..0h.
  const anchor = Date.UTC(ref.y, ref.mo - 1, ref.d, ref.h, 0, 0);
  const targets = [];
  for (let i = span; i >= 0; i -= 1) {
    targets.push(hourKey(new Date(anchor - i * 3600 * 1000)));
  }
  const startDate = targets[0].slice(0, 10);
  const endDate = targets[targets.length - 1].slice(0, 10);

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: startDate,
    end_date: endDate,
    hourly: "weather_code,temperature_2m",
    timezone: "Asia/Tokyo",
  });
  const url = `${ARCHIVE_URL}?${params.toString()}`;

  const res = await fetchImpl(url);
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.reason || "";
    } catch {
      /* ignore */
    }
    throw new Error(`天气接口返回错误（${res.status}）${detail ? "：" + detail : ""}`);
  }
  const data = await res.json();
  const times = data?.hourly?.time || [];
  const codes = data?.hourly?.weather_code || [];
  const temps = data?.hourly?.temperature_2m || [];
  const byTime = new Map();
  times.forEach((t, idx) => {
    byTime.set(t, { code: codes[idx], temp: temps[idx] });
  });

  const hourly = targets.map((t) => {
    const hit = byTime.get(t);
    return {
      time: t,
      code: hit && Number.isFinite(hit.code) ? hit.code : null,
      temp: hit && Number.isFinite(hit.temp) ? hit.temp : null,
    };
  });

  if (hourly.every((h) => h.code === null)) {
    throw new Error(
      "这个日期查不到历史天气（Open-Meteo 档案对太近的日期有几天延迟，或该日期还没有数据）。",
    );
  }

  return {
    source: "open-meteo",
    fetchedAt: new Date().toISOString(),
    lat,
    lon,
    referenceTime,
    hourly,
  };
}
