/* A bundled city table for the "Pick the nearest city instead" step (docs/ux-flows.md 4.2).
   Sunrise and sunset move by a minute or two per hundred kilometres, so a nearby city is
   plenty. No service call is ever made. [name, region, lat, lng, IANA time zone]. */
'use strict';

const CITIES = [
  // United States
  ['Atlanta', 'Georgia', 33.75, -84.39, 'America/New_York'], ['Austin', 'Texas', 30.27, -97.74, 'America/Chicago'],
  ['Baltimore', 'Maryland', 39.29, -76.61, 'America/New_York'], ['Boise', 'Idaho', 43.62, -116.2, 'America/Boise'],
  ['Boston', 'Massachusetts', 42.36, -71.06, 'America/New_York'], ['Buffalo', 'New York', 42.89, -78.88, 'America/New_York'],
  ['Charlotte', 'North Carolina', 35.23, -80.84, 'America/New_York'], ['Chicago', 'Illinois', 41.88, -87.63, 'America/Chicago'],
  ['Cincinnati', 'Ohio', 39.1, -84.51, 'America/New_York'], ['Cleveland', 'Ohio', 41.5, -81.69, 'America/New_York'],
  ['Columbus', 'Ohio', 39.96, -83.0, 'America/New_York'], ['Dallas', 'Texas', 32.78, -96.8, 'America/Chicago'],
  ['Denver', 'Colorado', 39.74, -104.99, 'America/Denver'], ['Des Moines', 'Iowa', 41.59, -93.62, 'America/Chicago'],
  ['Detroit', 'Michigan', 42.33, -83.05, 'America/Detroit'], ['El Paso', 'Texas', 31.76, -106.49, 'America/Denver'],
  ['Fresno', 'California', 36.74, -119.79, 'America/Los_Angeles'], ['Hartford', 'Connecticut', 41.76, -72.69, 'America/New_York'],
  ['Honolulu', 'Hawaii', 21.31, -157.86, 'Pacific/Honolulu'], ['Houston', 'Texas', 29.76, -95.37, 'America/Chicago'],
  ['Indianapolis', 'Indiana', 39.77, -86.16, 'America/Indiana/Indianapolis'], ['Jacksonville', 'Florida', 30.33, -81.66, 'America/New_York'],
  ['Kansas City', 'Missouri', 39.1, -94.58, 'America/Chicago'], ['Las Vegas', 'Nevada', 36.17, -115.14, 'America/Los_Angeles'],
  ['Los Angeles', 'California', 34.05, -118.24, 'America/Los_Angeles'], ['Louisville', 'Kentucky', 38.25, -85.76, 'America/Kentucky/Louisville'],
  ['Memphis', 'Tennessee', 35.15, -90.05, 'America/Chicago'], ['Miami', 'Florida', 25.76, -80.19, 'America/New_York'],
  ['Milwaukee', 'Wisconsin', 43.04, -87.91, 'America/Chicago'], ['Minneapolis', 'Minnesota', 44.98, -93.27, 'America/Chicago'],
  ['Nashville', 'Tennessee', 36.16, -86.78, 'America/Chicago'], ['New Orleans', 'Louisiana', 29.95, -90.07, 'America/Chicago'],
  ['New York', 'New York', 40.71, -74.01, 'America/New_York'], ['Oklahoma City', 'Oklahoma', 35.47, -97.52, 'America/Chicago'],
  ['Omaha', 'Nebraska', 41.26, -95.93, 'America/Chicago'], ['Orlando', 'Florida', 28.54, -81.38, 'America/New_York'],
  ['Philadelphia', 'Pennsylvania', 39.95, -75.17, 'America/New_York'], ['Phoenix', 'Arizona', 33.45, -112.07, 'America/Phoenix'],
  ['Pittsburgh', 'Pennsylvania', 40.44, -80.0, 'America/New_York'], ['Portland', 'Oregon', 45.52, -122.68, 'America/Los_Angeles'],
  ['Providence', 'Rhode Island', 41.82, -71.41, 'America/New_York'], ['Raleigh', 'North Carolina', 35.78, -78.64, 'America/New_York'],
  ['Richmond', 'Virginia', 37.54, -77.44, 'America/New_York'], ['Sacramento', 'California', 38.58, -121.49, 'America/Los_Angeles'],
  ['Salt Lake City', 'Utah', 40.76, -111.89, 'America/Denver'], ['San Antonio', 'Texas', 29.42, -98.49, 'America/Chicago'],
  ['San Diego', 'California', 32.72, -117.16, 'America/Los_Angeles'], ['San Francisco', 'California', 37.77, -122.42, 'America/Los_Angeles'],
  ['San Jose', 'California', 37.34, -121.89, 'America/Los_Angeles'], ['Seattle', 'Washington', 47.61, -122.33, 'America/Los_Angeles'],
  ['St. Louis', 'Missouri', 38.63, -90.2, 'America/Chicago'], ['Tampa', 'Florida', 27.95, -82.46, 'America/New_York'],
  ['Tucson', 'Arizona', 32.22, -110.97, 'America/Phoenix'], ['Washington', 'District of Columbia', 38.9, -77.04, 'America/New_York'],
  ['Albuquerque', 'New Mexico', 35.08, -106.65, 'America/Denver'], ['Anchorage', 'Alaska', 61.22, -149.9, 'America/Anchorage'],
  ['Birmingham', 'Alabama', 33.52, -86.8, 'America/Chicago'], ['Charleston', 'South Carolina', 32.78, -79.93, 'America/New_York'],
  ['Little Rock', 'Arkansas', 34.75, -92.29, 'America/Chicago'], ['Madison', 'Wisconsin', 43.07, -89.4, 'America/Chicago'],
  ['Spokane', 'Washington', 47.66, -117.43, 'America/Los_Angeles'], ['Burlington', 'Vermont', 44.48, -73.21, 'America/New_York'],
  ['Portland', 'Maine', 43.66, -70.26, 'America/New_York'], ['Albany', 'New York', 42.65, -73.76, 'America/New_York'],
  ['Fargo', 'North Dakota', 46.88, -96.79, 'America/Chicago'], ['Billings', 'Montana', 45.78, -108.5, 'America/Denver'],
  ['Cheyenne', 'Wyoming', 41.14, -104.82, 'America/Denver'], ['Sioux Falls', 'South Dakota', 43.55, -96.73, 'America/Chicago'],
  ['Wichita', 'Kansas', 37.69, -97.34, 'America/Chicago'], ['Jackson', 'Mississippi', 32.3, -90.18, 'America/Chicago'],
  ['Reno', 'Nevada', 39.53, -119.81, 'America/Los_Angeles'], ['Grand Rapids', 'Michigan', 42.96, -85.67, 'America/Detroit'],
  // Canada
  ['Calgary', 'Alberta', 51.05, -114.07, 'America/Edmonton'], ['Edmonton', 'Alberta', 53.55, -113.49, 'America/Edmonton'],
  ['Halifax', 'Nova Scotia', 44.65, -63.58, 'America/Halifax'], ['Montreal', 'Quebec', 45.5, -73.57, 'America/Toronto'],
  ['Ottawa', 'Ontario', 45.42, -75.7, 'America/Toronto'], ['Quebec City', 'Quebec', 46.81, -71.21, 'America/Toronto'],
  ['Regina', 'Saskatchewan', 50.45, -104.62, 'America/Regina'], ['Toronto', 'Ontario', 43.65, -79.38, 'America/Toronto'],
  ['Vancouver', 'British Columbia', 49.28, -123.12, 'America/Vancouver'], ['Winnipeg', 'Manitoba', 49.9, -97.14, 'America/Winnipeg'],
  ['St. John\'s', 'Newfoundland', 47.56, -52.71, 'America/St_Johns'], ['Victoria', 'British Columbia', 48.43, -123.37, 'America/Vancouver'],
  // Mexico, Central and South America
  ['Mexico City', 'Mexico', 19.43, -99.13, 'America/Mexico_City'], ['Guadalajara', 'Mexico', 20.67, -103.35, 'America/Mexico_City'],
  ['Monterrey', 'Mexico', 25.69, -100.32, 'America/Monterrey'], ['Tijuana', 'Mexico', 32.51, -117.04, 'America/Tijuana'],
  ['Cancun', 'Mexico', 21.16, -86.85, 'America/Cancun'], ['San Juan', 'Puerto Rico', 18.47, -66.11, 'America/Puerto_Rico'],
  ['Panama City', 'Panama', 8.98, -79.52, 'America/Panama'], ['San Jose', 'Costa Rica', 9.93, -84.08, 'America/Costa_Rica'],
  ['Bogota', 'Colombia', 4.71, -74.07, 'America/Bogota'], ['Lima', 'Peru', -12.05, -77.04, 'America/Lima'],
  ['Santiago', 'Chile', -33.45, -70.67, 'America/Santiago'], ['Buenos Aires', 'Argentina', -34.6, -58.38, 'America/Argentina/Buenos_Aires'],
  ['Sao Paulo', 'Brazil', -23.55, -46.63, 'America/Sao_Paulo'], ['Rio de Janeiro', 'Brazil', -22.91, -43.17, 'America/Sao_Paulo'],
  ['Brasilia', 'Brazil', -15.79, -47.88, 'America/Sao_Paulo'], ['Quito', 'Ecuador', -0.18, -78.47, 'America/Guayaquil'],
  ['Caracas', 'Venezuela', 10.48, -66.9, 'America/Caracas'], ['Montevideo', 'Uruguay', -34.9, -56.16, 'America/Montevideo'],
  // United Kingdom and Ireland
  ['London', 'United Kingdom', 51.51, -0.13, 'Europe/London'], ['Manchester', 'United Kingdom', 53.48, -2.24, 'Europe/London'],
  ['Birmingham', 'United Kingdom', 52.49, -1.89, 'Europe/London'], ['Leeds', 'United Kingdom', 53.8, -1.55, 'Europe/London'],
  ['Glasgow', 'United Kingdom', 55.86, -4.25, 'Europe/London'], ['Edinburgh', 'United Kingdom', 55.95, -3.19, 'Europe/London'],
  ['Bristol', 'United Kingdom', 51.45, -2.59, 'Europe/London'], ['Cardiff', 'United Kingdom', 51.48, -3.18, 'Europe/London'],
  ['Belfast', 'United Kingdom', 54.6, -5.93, 'Europe/London'], ['Newcastle', 'United Kingdom', 54.98, -1.61, 'Europe/London'],
  ['Dublin', 'Ireland', 53.35, -6.26, 'Europe/Dublin'], ['Cork', 'Ireland', 51.9, -8.47, 'Europe/Dublin'],
  // Europe
  ['Amsterdam', 'Netherlands', 52.37, 4.9, 'Europe/Amsterdam'], ['Athens', 'Greece', 37.98, 23.73, 'Europe/Athens'],
  ['Barcelona', 'Spain', 41.39, 2.17, 'Europe/Madrid'], ['Berlin', 'Germany', 52.52, 13.41, 'Europe/Berlin'],
  ['Brussels', 'Belgium', 50.85, 4.35, 'Europe/Brussels'], ['Budapest', 'Hungary', 47.5, 19.04, 'Europe/Budapest'],
  ['Copenhagen', 'Denmark', 55.68, 12.57, 'Europe/Copenhagen'], ['Frankfurt', 'Germany', 50.11, 8.68, 'Europe/Berlin'],
  ['Geneva', 'Switzerland', 46.2, 6.14, 'Europe/Zurich'], ['Hamburg', 'Germany', 53.55, 9.99, 'Europe/Berlin'],
  ['Helsinki', 'Finland', 60.17, 24.94, 'Europe/Helsinki'], ['Istanbul', 'Turkey', 41.01, 28.98, 'Europe/Istanbul'],
  ['Lisbon', 'Portugal', 38.72, -9.14, 'Europe/Lisbon'], ['Lyon', 'France', 45.76, 4.84, 'Europe/Paris'],
  ['Madrid', 'Spain', 40.42, -3.7, 'Europe/Madrid'], ['Milan', 'Italy', 45.46, 9.19, 'Europe/Rome'],
  ['Munich', 'Germany', 48.14, 11.58, 'Europe/Berlin'], ['Oslo', 'Norway', 59.91, 10.75, 'Europe/Oslo'],
  ['Paris', 'France', 48.86, 2.35, 'Europe/Paris'], ['Prague', 'Czechia', 50.08, 14.44, 'Europe/Prague'],
  ['Reykjavik', 'Iceland', 64.15, -21.94, 'Atlantic/Reykjavik'], ['Rome', 'Italy', 41.9, 12.5, 'Europe/Rome'],
  ['Stockholm', 'Sweden', 59.33, 18.07, 'Europe/Stockholm'], ['Vienna', 'Austria', 48.21, 16.37, 'Europe/Vienna'],
  ['Warsaw', 'Poland', 52.23, 21.01, 'Europe/Warsaw'], ['Zurich', 'Switzerland', 47.38, 8.54, 'Europe/Zurich'],
  ['Kyiv', 'Ukraine', 50.45, 30.52, 'Europe/Kyiv'], ['Bucharest', 'Romania', 44.43, 26.1, 'Europe/Bucharest'],
  ['Marseille', 'France', 43.3, 5.37, 'Europe/Paris'], ['Naples', 'Italy', 40.85, 14.27, 'Europe/Rome'],
  ['Seville', 'Spain', 37.39, -5.98, 'Europe/Madrid'], ['Porto', 'Portugal', 41.15, -8.61, 'Europe/Lisbon'],
  ['Krakow', 'Poland', 50.06, 19.94, 'Europe/Warsaw'], ['Gothenburg', 'Sweden', 57.71, 11.97, 'Europe/Stockholm'],
  // Middle East and Africa
  ['Dubai', 'United Arab Emirates', 25.2, 55.27, 'Asia/Dubai'], ['Tel Aviv', 'Israel', 32.09, 34.78, 'Asia/Jerusalem'],
  ['Riyadh', 'Saudi Arabia', 24.71, 46.68, 'Asia/Riyadh'], ['Doha', 'Qatar', 25.29, 51.53, 'Asia/Qatar'],
  ['Cairo', 'Egypt', 30.04, 31.24, 'Africa/Cairo'], ['Casablanca', 'Morocco', 33.57, -7.59, 'Africa/Casablanca'],
  ['Lagos', 'Nigeria', 6.52, 3.38, 'Africa/Lagos'], ['Nairobi', 'Kenya', -1.29, 36.82, 'Africa/Nairobi'],
  ['Johannesburg', 'South Africa', -26.2, 28.05, 'Africa/Johannesburg'], ['Cape Town', 'South Africa', -33.92, 18.42, 'Africa/Johannesburg'],
  ['Accra', 'Ghana', 5.6, -0.19, 'Africa/Accra'], ['Addis Ababa', 'Ethiopia', 9.03, 38.74, 'Africa/Addis_Ababa'],
  // Asia
  ['Bangkok', 'Thailand', 13.76, 100.5, 'Asia/Bangkok'], ['Beijing', 'China', 39.9, 116.4, 'Asia/Shanghai'],
  ['Delhi', 'India', 28.61, 77.21, 'Asia/Kolkata'], ['Hong Kong', 'China', 22.32, 114.17, 'Asia/Hong_Kong'],
  ['Jakarta', 'Indonesia', -6.21, 106.85, 'Asia/Jakarta'], ['Kuala Lumpur', 'Malaysia', 3.14, 101.69, 'Asia/Kuala_Lumpur'],
  ['Manila', 'Philippines', 14.6, 120.98, 'Asia/Manila'], ['Mumbai', 'India', 19.08, 72.88, 'Asia/Kolkata'],
  ['Bengaluru', 'India', 12.97, 77.59, 'Asia/Kolkata'], ['Osaka', 'Japan', 34.69, 135.5, 'Asia/Tokyo'],
  ['Seoul', 'South Korea', 37.57, 126.98, 'Asia/Seoul'], ['Shanghai', 'China', 31.23, 121.47, 'Asia/Shanghai'],
  ['Singapore', 'Singapore', 1.35, 103.82, 'Asia/Singapore'], ['Taipei', 'Taiwan', 25.03, 121.57, 'Asia/Taipei'],
  ['Tokyo', 'Japan', 35.68, 139.69, 'Asia/Tokyo'], ['Hanoi', 'Vietnam', 21.03, 105.85, 'Asia/Ho_Chi_Minh'],
  ['Ho Chi Minh City', 'Vietnam', 10.82, 106.63, 'Asia/Ho_Chi_Minh'], ['Karachi', 'Pakistan', 24.86, 67.01, 'Asia/Karachi'],
  ['Dhaka', 'Bangladesh', 23.81, 90.41, 'Asia/Dhaka'], ['Colombo', 'Sri Lanka', 6.93, 79.85, 'Asia/Colombo'],
  ['Kathmandu', 'Nepal', 27.72, 85.32, 'Asia/Kathmandu'], ['Sapporo', 'Japan', 43.06, 141.35, 'Asia/Tokyo'],
  // Australia and New Zealand
  ['Adelaide', 'Australia', -34.93, 138.6, 'Australia/Adelaide'], ['Brisbane', 'Australia', -27.47, 153.03, 'Australia/Brisbane'],
  ['Canberra', 'Australia', -35.28, 149.13, 'Australia/Sydney'], ['Darwin', 'Australia', -12.46, 130.84, 'Australia/Darwin'],
  ['Hobart', 'Australia', -42.88, 147.33, 'Australia/Hobart'], ['Melbourne', 'Australia', -37.81, 144.96, 'Australia/Melbourne'],
  ['Perth', 'Australia', -31.95, 115.86, 'Australia/Perth'], ['Sydney', 'Australia', -33.87, 151.21, 'Australia/Sydney'],
  ['Gold Coast', 'Australia', -28.02, 153.4, 'Australia/Brisbane'], ['Auckland', 'New Zealand', -36.85, 174.76, 'Pacific/Auckland'],
  ['Wellington', 'New Zealand', -41.29, 174.78, 'Pacific/Auckland'], ['Christchurch', 'New Zealand', -43.53, 172.64, 'Pacific/Auckland'],
];

// Case-insensitive prefix and substring match on the name, then the region. Returns at most `limit` rows.
function searchCities(q, limit = 12) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return CITIES.slice(0, limit);
  const starts = [], contains = [];
  for (const c of CITIES) {
    const name = c[0].toLowerCase(), region = c[1].toLowerCase();
    if (name.startsWith(s)) starts.push(c);
    else if (name.includes(s) || region.includes(s)) contains.push(c);
  }
  return [...starts, ...contains].slice(0, limit);
}
// The nearest bundled city to a point, for the "Near Portland" caption after "Use my location".
function nearestCity(lat, lng) {
  let best = null, bd = Infinity;
  for (const c of CITIES) {
    const dlat = c[2] - lat, dlng = (c[3] - lng) * Math.cos(lat * Math.PI / 180);
    const d = dlat * dlat + dlng * dlng;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
window.CITIES = CITIES; window.searchCities = searchCities; window.nearestCity = nearestCity;
