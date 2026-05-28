# Login Troubleshooting Guide

## ✅ Working Test Accounts

### Account 1 (Simple)
- **Email:** `demo@stockanalyzer.com`
- **Password:** `demo123`

### Account 2 (Original)
- **Email:** `test@example.com`
- **Password:** `password123`

---

## 🔧 If Login Still Fails

### Step 1: Check Browser Console
1. Open http://localhost:3000/login
2. Press F12 to open Developer Tools
3. Go to "Console" tab
4. Try to login
5. Look for red error messages

**Common errors:**
- `CORS error` → API CORS not configured (already fixed)
- `Network error` → API not running
- `401 Unauthorized` → Wrong credentials
- `Failed to fetch` → Wrong API URL in frontend

### Step 2: Verify API is Running
```bash
curl http://localhost:8000/api/user
# Should return: {"message":"Unauthenticated."}
```

### Step 3: Test Login Manually
```bash
curl -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@stockanalyzer.com","password":"demo123"}'
```

**Expected response:**
```json
{
  "token": "3|...",
  "user": {
    "id": 2,
    "name": "Demo User",
    "email": "demo@stockanalyzer.com"
  }
}
```

### Step 4: Check Frontend Environment
```bash
cat frontend/.env.local
# Should show: NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

If missing, create it:
```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api" > frontend/.env.local
# Restart Next.js
pkill -f "next dev" && cd frontend && npm run dev
```

### Step 5: Check Browser Network Tab
1. F12 → Network tab
2. Try login
3. Look for request to `http://localhost:8000/api/login`
4. Click on it to see:
   - Request URL (should be localhost:8000, NOT localhost:3000)
   - Status code (should be 200)
   - Response body

---

## 🐛 Common Issues

### Issue: "Invalid credentials" but password is correct
**Cause:** User doesn't exist or password hash mismatch

**Fix:** Recreate the user
```bash
cd api
php artisan tinker --execute='
\App\Models\User::where("email", "demo@stockanalyzer.com")->delete();
\App\Models\User::create([
    "name" => "Demo",
    "email" => "demo@stockanalyzer.com",
    "password" => bcrypt("demo123")
]);
'
```

### Issue: Login button does nothing
**Cause:** JavaScript error in frontend

**Fix:** Check browser console (F12) for red errors

### Issue: "Cannot reach API"
**Cause:** Laravel server stopped

**Fix:** Restart it
```bash
cd api
php artisan serve --port=8000
```

### Issue: Login succeeds but redirects to login again
**Cause:** Token not being stored in localStorage

**Fix:** 
1. Check browser console for errors
2. Verify `localStorage.getItem('token')` in console
3. Make sure no browser extensions are blocking localStorage

---

## 🧪 Manual Login (Bypass UI)

If the UI login is broken, you can manually set the token:

1. Get a token:
```bash
curl -s -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@stockanalyzer.com","password":"demo123"}' \
  | jq -r '.token'
```

2. Open http://localhost:3000
3. Press F12 → Console
4. Run:
```javascript
localStorage.setItem('token', 'PASTE_TOKEN_HERE')
location.reload()
```

---

## 📝 Create Your Own Account

Instead of using demo accounts, register:

1. Go to http://localhost:3000/register
2. Fill in:
   - Name: Your Name
   - Email: your@email.com
   - Password: yourpassword
   - Confirm Password: yourpassword
3. Click Register

If registration fails, check the same troubleshooting steps above.

---

## 🔍 Debug Mode

To see what's happening in the auth flow:

1. Edit `frontend/src/lib/auth.ts`
2. Add console.log statements:
```typescript
export async function login(email: string, password: string) {
  console.log('Attempting login with:', email);
  const { data } = await api.post("/login", { email, password });
  console.log('Login response:', data);
  localStorage.setItem("token", data.token);
  return data.user;
}
```

3. Restart Next.js
4. Try login and watch browser console

---

## 🆘 Still Not Working?

1. Check all services are running:
```bash
# Should show 3 processes
ps aux | grep -E "(artisan serve|next dev|uvicorn)"
```

2. Restart everything:
```bash
pkill -f "artisan serve"
pkill -f "next dev"
pkill -f "uvicorn"

cd api && php artisan serve --port=8000 &
cd ../frontend && npm run dev &
cd ../ai-engine && source venv/bin/activate && uvicorn main:app --port 8001 &
```

3. Clear browser cache (Cmd+Shift+R on Mac)

4. Try a different browser (Chrome, Firefox, Safari)
