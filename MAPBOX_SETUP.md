# Mapbox Setup Guide (Free Alternative to Google Maps)

## 🎉 Why Mapbox?

- **FREE**: 50,000 map loads/month (no credit card required!)
- **No Billing**: Unlike Google Maps, no billing account needed
- **3D Maps**: Built-in support for 3D views
- **React Support**: Excellent React integration with `react-map-gl`
- **Customizable**: Highly customizable map styles

## ✅ Quick Setup (5 minutes)

### 1. Get Your Free Mapbox Token

1. Go to [https://account.mapbox.com/](https://account.mapbox.com/)
2. Sign up for a free account (no credit card required!)
3. Go to your [Access Tokens page](https://account.mapbox.com/access-tokens/)
4. Copy your **Default Public Token**

### 2. Add Token to .env File

Add this line to your `.env` file:

```env
VITE_MAPBOX_ACCESS_TOKEN=pk.your_token_here
```

**Important**: 
- Replace `pk.your_token_here` with your actual token
- No quotes needed
- No spaces around the `=`

### 3. Switch to Mapbox Component

The code is already set up! Just make sure `GroupDetailPage.tsx` imports the Mapbox version:

```typescript
import MapSection from '../Group/MapSectionMapbox'; // Mapbox (Free alternative)
```

### 4. Restart Your Dev Server

```bash
# Stop your server (Ctrl+C)
npm run dev
# or
npm run turnon
```

### 5. Test It!

1. Navigate to a group page
2. Click on "Live Map" tab
3. Map should load! 🎉

## 📊 Free Tier Limits

- **50,000 map loads/month** - Perfect for development and small apps
- **No credit card required**
- **All features included**: 3D maps, routing, geocoding

## 🔄 Switching Back to Google Maps

If you want to use Google Maps instead:

1. In `GroupDetailPage.tsx`, change the import:
```typescript
import MapSection from '../Group/MapSection'; // Google Maps
```

2. Make sure you have `VITE_GOOGLE_MAPS_API_KEY` in your `.env`

## 🎨 Customizing Map Styles

Mapbox offers many free map styles. Change the `mapStyle` prop in `MapSectionMapbox.tsx`:

- `mapbox://styles/mapbox/streets-v12` - Street map (default)
- `mapbox://styles/mapbox/satellite-v9` - Satellite view
- `mapbox://styles/mapbox/dark-v11` - Dark theme
- `mapbox://styles/mapbox/light-v11` - Light theme
- `mapbox://styles/mapbox/navigation-day-v1` - Navigation style

## 🚀 Features Included

✅ Real-time member location tracking  
✅ 3D map view (pitch & rotation)  
✅ Meet-up points  
✅ Route calculation  
✅ Emergency alerts  
✅ Location sharing  
✅ All the same features as Google Maps version!

## 💡 Tips

- The free tier is very generous for development
- You can upgrade later if needed (starts at $5/month)
- Mapbox has excellent documentation: [https://docs.mapbox.com/](https://docs.mapbox.com/)
- Support is great on their community forum

## 🐛 Troubleshooting

### Map doesn't load
- Check your token is correct in `.env`
- Restart dev server
- Check browser console for errors

### Routes don't calculate
- Make sure you have a valid current location
- Check browser console for API errors
- Verify token has Directions API access (included in free tier)

### Location sharing doesn't work
- Check browser permissions
- HTTPS required in production (localhost works for dev)

## 📝 Comparison: Mapbox vs Google Maps

| Feature | Mapbox | Google Maps |
|---------|--------|-------------|
| Free Tier | 50K loads/month | $200 credit/month |
| Credit Card | Not required | Required |
| 3D Maps | ✅ Built-in | ✅ Available |
| React Support | ✅ Excellent | ✅ Good |
| Customization | ✅ Very high | ⚠️ Limited |
| Routing | ✅ Included | ✅ Included |

**Verdict**: Mapbox is better for free tier and development! 🎉

