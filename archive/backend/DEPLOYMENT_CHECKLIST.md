# Backend Deployment Checklist

## Pre-Deployment Security Audit

### Critical Issues (Must Fix)
- [x] Remove hardcoded credentials from `.env` file
- [x] Create `.env.example` with placeholder values
- [x] Add `.env` to `.gitignore`
- [x] Implement environment variable validation
- [x] Add health check endpoint
- [x] Configure CORS properly
- [x] Add error handling middleware
- [x] Implement request logging
- [ ] Add rate limiting on auth endpoints
- [ ] Implement input validation with Joi
- [ ] Protect admin signup endpoint
- [ ] Add SMS provider integration (Twilio/AWS SNS)

### Important Issues (Should Fix)
- [ ] Add database indexes on frequently queried fields
- [ ] Implement pagination for list endpoints
- [ ] Add request/response logging
- [ ] Implement error tracking (Sentry)
- [ ] Add API documentation (Swagger/OpenAPI)
- [ ] Write integration tests
- [ ] Configure HTTPS/SSL (automatic on Render)
- [ ] Set up monitoring and alerting
- [ ] Implement database backups
- [ ] Add transaction support for multi-step operations

## Environment Variables Checklist

### Required Variables
- [ ] `MONGO_URI` - MongoDB connection string
- [ ] `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- [ ] `CLOUDINARY_API_KEY` - Cloudinary API key
- [ ] `CLOUDINARY_API_SECRET` - Cloudinary API secret
- [ ] `JWT_SECRET` - JWT signing secret (min 32 chars)
- [ ] `JWT_EXPIRES_IN` - JWT expiration time
- [ ] `NODE_ENV` - Set to "production"
- [ ] `PORT` - Server port (Render assigns dynamically)
- [ ] `FRONTEND_URL` - Frontend domain for CORS

### Optional Variables
- [ ] `TWILIO_ACCOUNT_SID` - For SMS integration
- [ ] `TWILIO_AUTH_TOKEN` - For SMS integration
- [ ] `TWILIO_PHONE_NUMBER` - For SMS integration
- [ ] `ADMIN_SECRET_KEY` - For protected admin signup

## Render Deployment Steps

### 1. Repository Setup
- [ ] Push code to GitHub
- [ ] Ensure `.env` is in `.gitignore`
- [ ] Verify `package.json` has correct start script
- [ ] Check `render.yaml` is in root directory

### 2. Render Configuration
- [ ] Create Render account
- [ ] Connect GitHub repository
- [ ] Select Node.js environment
- [ ] Set build command: `npm install`
- [ ] Set start command: `npm start`
- [ ] Add all environment variables
- [ ] Set health check path: `/health`

### 3. Database Setup
- [ ] Create MongoDB Atlas cluster
- [ ] Create database user with strong password
- [ ] Whitelist Render IP (0.0.0.0/0 or specific IP)
- [ ] Get connection string
- [ ] Add MONGO_URI to Render environment

### 4. Cloudinary Setup
- [ ] Create Cloudinary account
- [ ] Get API credentials
- [ ] Add to Render environment variables
- [ ] Test image upload functionality

### 5. Deployment Verification
- [ ] Deploy to Render
- [ ] Check deployment logs for errors
- [ ] Test health endpoint: `GET /health`
- [ ] Test API endpoints with Postman/curl
- [ ] Verify database connection
- [ ] Verify Cloudinary uploads work

## Post-Deployment Testing

### API Endpoints to Test
- [ ] `GET /` - Welcome endpoint
- [ ] `GET /health` - Health check
- [ ] `POST /api/customer/signup` - Customer signup
- [ ] `POST /api/seller/signup` - Seller signup
- [ ] `POST /api/admin/signup` - Admin signup
- [ ] `GET /api/admin/categories` - Get categories
- [ ] `GET /api/products` - Get products
- [ ] `POST /api/products` - Create product (with auth)

### Performance Testing
- [ ] Response time < 500ms
- [ ] Database queries optimized
- [ ] Image uploads complete successfully
- [ ] No memory leaks in logs
- [ ] CPU usage reasonable

### Security Testing
- [ ] JWT tokens work correctly
- [ ] Role-based access control enforced
- [ ] Unauthorized requests rejected
- [ ] CORS headers correct
- [ ] No sensitive data in responses
- [ ] Password hashing working

## Monitoring & Maintenance

### Daily Tasks
- [ ] Check error logs
- [ ] Monitor API response times
- [ ] Verify database connectivity

### Weekly Tasks
- [ ] Review security logs
- [ ] Check disk usage
- [ ] Monitor error rates
- [ ] Update dependencies (if needed)

### Monthly Tasks
- [ ] Rotate API keys
- [ ] Review access logs
- [ ] Backup database
- [ ] Update security patches
- [ ] Performance optimization review

## Scaling Recommendations

### When to Upgrade
- **Free → Starter**: When experiencing frequent cold starts
- **Starter → Standard**: When handling > 1000 requests/day
- **Standard → Pro**: When handling > 10000 requests/day

### Database Scaling
- Add indexes on frequently queried fields
- Implement caching (Redis)
- Archive old data
- Optimize queries

### API Scaling
- Implement rate limiting
- Add request caching
- Use CDN for static assets
- Implement pagination

## Troubleshooting Guide

### MongoDB Connection Issues
```
Error: connect ECONNREFUSED
Solution: Check MONGO_URI, verify IP whitelist, ensure user permissions
```

### Cloudinary Upload Failures
```
Error: Upload failed
Solution: Verify API credentials, check file size, ensure folder permissions
```

### Port Already in Use
```
Error: listen EADDRINUSE
Solution: Render assigns PORT dynamically, don't hardcode port numbers
```

### Cold Start Timeout
```
Error: Application failed to start
Solution: Upgrade from Free to Starter plan, implement health checks
```

### JWT Token Errors
```
Error: Invalid or expired token
Solution: Verify JWT_SECRET, check token expiration, ensure Bearer format
```

## Rollback Procedure

If deployment fails:
1. Check Render deployment logs
2. Verify environment variables
3. Test locally with same environment
4. Rollback to previous version in Render
5. Fix issues and redeploy

## Documentation Links

- [Render Documentation](https://render.com/docs)
- [MongoDB Atlas Guide](https://docs.atlas.mongodb.com/)
- [Cloudinary API Reference](https://cloudinary.com/documentation/cloudinary_api)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

## Support Contacts

- Render Support: support@render.com
- MongoDB Support: support@mongodb.com
- Cloudinary Support: support@cloudinary.com
