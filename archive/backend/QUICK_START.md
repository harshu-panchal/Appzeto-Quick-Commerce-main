# Quick Start Guide - Backend Deployment on Render

## 5-Minute Setup

### Step 1: Prepare Your Repository
```bash
# Clone or navigate to your backend directory
cd backend

# Copy environment template
cp .env.example .env

# Update .env with your credentials
# MONGO_URI=your_mongodb_connection_string
# CLOUDINARY_CLOUD_NAME=your_cloud_name
# CLOUDINARY_API_KEY=your_api_key
# CLOUDINARY_API_SECRET=your_api_secret
# JWT_SECRET=generate_a_random_32_char_string
```

### Step 2: Test Locally
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Test health endpoint
curl http://localhost:7000/health
```

### Step 3: Deploy to Render

#### Option A: Using Render Dashboard (Easiest)
1. Go to [render.com](https://render.com)
2. Sign up or log in
3. Click "New +" → "Web Service"
4. Connect your GitHub repository
5. Fill in:
   - **Name**: `quick-commerce-api`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free` (or Starter for production)

6. Click "Advanced" and add environment variables:
   ```
   MONGO_URI=your_mongodb_uri
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   JWT_SECRET=your_jwt_secret
   NODE_ENV=production
   FRONTEND_URL=your_frontend_url
   ```

7. Click "Create Web Service"
8. Wait for deployment (2-3 minutes)
9. Your API is live! 🎉

#### Option B: Using render.yaml (Recommended)
1. Ensure `render.yaml` exists in backend root
2. Push to GitHub
3. Go to Render Dashboard
4. Click "New +" → "Web Service"
5. Select your repository
6. Render auto-detects `render.yaml`
7. Add environment variables
8. Deploy

### Step 4: Verify Deployment
```bash
# Replace YOUR_APP_URL with your Render URL
curl https://YOUR_APP_URL.onrender.com/health

# Expected response:
# {"status":"OK","timestamp":"2024-01-15T10:30:00.000Z","environment":"production"}
```

## Common Issues & Solutions

### Issue: MongoDB Connection Failed
**Solution:**
1. Verify MONGO_URI format
2. Check MongoDB Atlas IP whitelist (add 0.0.0.0/0)
3. Ensure database user has correct permissions
4. Test connection string locally first

### Issue: Cloudinary Upload Fails
**Solution:**
1. Verify API credentials are correct
2. Check file size (max 5MB)
3. Ensure Cloudinary account is active
4. Test upload locally first

### Issue: Application Won't Start
**Solution:**
1. Check Render logs for errors
2. Verify all required environment variables are set
3. Ensure package.json has correct start script
4. Test locally with same environment variables

### Issue: Cold Start Timeout
**Solution:**
1. Upgrade from Free to Starter plan
2. Implement health check endpoint (already done)
3. Optimize database queries
4. Reduce startup time

## Environment Variables Reference

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| MONGO_URI | Yes | `mongodb+srv://...` | MongoDB Atlas connection string |
| CLOUDINARY_CLOUD_NAME | Yes | `dv1l9sb4p` | From Cloudinary dashboard |
| CLOUDINARY_API_KEY | Yes | `737441146281892` | From Cloudinary dashboard |
| CLOUDINARY_API_SECRET | Yes | `N6n7NdoFLDcEDnXPZCw8AoEC04c` | From Cloudinary dashboard |
| JWT_SECRET | Yes | `your_secret_key_min_32_chars` | Generate random string |
| JWT_EXPIRES_IN | No | `7d` | Token expiration time |
| NODE_ENV | Yes | `production` | Set to production on Render |
| PORT | No | `10000` | Render assigns automatically |
| FRONTEND_URL | No | `https://yourfrontend.com` | For CORS configuration |

## API Endpoints

### Health Check
```bash
GET /health
# Response: {"status":"OK","timestamp":"...","environment":"production"}
```

### Welcome
```bash
GET /
# Response: {"message":"Quick Commerce API","version":"1.0.0","status":"running"}
```

### Customer Auth
```bash
POST /api/customer/signup
POST /api/customer/login
POST /api/customer/verify-otp
GET /api/customer/profile
PUT /api/customer/profile
```

### Seller Auth
```bash
POST /api/seller/signup
POST /api/seller/login
GET /api/seller/profile
```

### Admin Auth
```bash
POST /api/admin/signup
POST /api/admin/login
```

### Products
```bash
GET /api/products
GET /api/products/:id
POST /api/products (seller/admin only)
PUT /api/products/:id (seller/admin only)
DELETE /api/products/:id (seller/admin only)
```

### Categories
```bash
GET /api/admin/categories
POST /api/admin/categories (admin only)
PUT /api/admin/categories/:id (admin only)
DELETE /api/admin/categories/:id (admin only)
```

## Monitoring

### View Logs
1. Go to Render Dashboard
2. Select your service
3. Click "Logs" tab
4. View real-time logs

### Check Status
1. Go to Render Dashboard
2. Check service status (green = running)
3. View deployment history

## Next Steps

1. **Connect Frontend**: Update frontend API URL to your Render URL
2. **Test Thoroughly**: Test all API endpoints
3. **Monitor Performance**: Check logs and response times
4. **Set Up Alerts**: Configure Render alerts for errors
5. **Implement Features**: Add SMS integration, rate limiting, etc.

## Support

- **Render Docs**: https://render.com/docs
- **MongoDB Docs**: https://docs.mongodb.com
- **Cloudinary Docs**: https://cloudinary.com/documentation
- **Express Docs**: https://expressjs.com

## Production Checklist

Before going live:
- [ ] All environment variables configured
- [ ] Database backups enabled
- [ ] CORS configured for your frontend domain
- [ ] API tested with Postman/curl
- [ ] Error logging configured
- [ ] Rate limiting implemented
- [ ] Input validation added
- [ ] Security headers configured
- [ ] SSL/TLS enabled (automatic on Render)
- [ ] Monitoring and alerts set up

---

**Deployment Time**: ~5-10 minutes
**Cost**: Free tier available (with limitations)
**Uptime**: 99.9% SLA on paid plans
