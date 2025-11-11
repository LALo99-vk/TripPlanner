# Google Maps Setup Checklist

## ✅ Steps to Verify Your Setup

### 1. Environment Variable
- [ ] Added `VITE_GOOGLE_MAPS_API_KEY=your_key_here` to `.env` file
- [ ] No quotes around the key
- [ ] No spaces around the `=` sign
- [ ] Restarted dev server after adding the key

### 2. Google Cloud Console
- [ ] Created a project in [Google Cloud Console](https://console.cloud.google.com/)
- [ ] Enabled **Maps JavaScript API**
- [ ] Enabled **Directions API** (for route calculation)
- [ ] Created an API key
- [ ] (Optional) Restricted the key to your domain for security

### 3. Database Setup
- [ ] Run `supabase-groups-schema.sql` in Supabase SQL Editor
- [ ] Tables created: `group_member_locations`, `group_meetups`, `group_alerts`

### 4. Testing
- [ ] Navigate to a group page
- [ ] Click on "Live Map" tab
- [ ] Map should load (not show "API Key Required" message)
- [ ] Allow location permissions when prompted
- [ ] Try clicking "Share Location" button
- [ ] Try clicking on map to add a meet-up point

## 🔧 Troubleshooting

### Map shows "API Key Required"
- Check `.env` file has the correct variable name: `VITE_GOOGLE_MAPS_API_KEY`
- Restart dev server
- Check browser console for errors

### Map loads but shows errors in console
- Verify APIs are enabled in Google Cloud Console
- Check API key restrictions (if any)
- Verify billing is enabled (Google Maps requires billing)

### Location sharing doesn't work
- Check browser permissions (HTTPS required in production)
- Verify `navigator.geolocation` is available
- Check browser console for permission errors

### Routes don't calculate
- Verify Directions API is enabled
- Check browser console for API errors
- Verify you have a valid current location

## 📝 Notes

- The API key is loaded at build/dev server start time
- Changes to `.env` require server restart
- Google Maps requires billing to be enabled (free tier available)
- Location services require HTTPS in production (localhost works for development)

