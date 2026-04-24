# Chat Feature - Complete Testing Guide

## Prerequisites

```bash
cd /Users/rakeshcheekatimala/Desktop/Learnings/Hackathon/lumen
```

Make sure `.env` file exists in `backend/` with either:
```bash
ANTHROPIC_API_KEY=sk-...  # Real API key, OR
MOCK_AI=true              # For testing without API key
```

---

## Step 1: Start the Backend

```bash
make backend
```

Expected output:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

✓ Backend is ready when you see these lines

---

## Step 2: Start the Frontend (New Terminal)

```bash
make frontend
```

Expected output:
```
VITE v5.4.21  ready in XXX ms

➜  Local:   http://localhost:3000/
➜  press h to show help
```

✓ Frontend is ready when you see the local URL

---

## Step 3: Test Basic Chat Connection

### 3a. Open Browser DevTools

1. Open `http://localhost:3000` in Chrome/Firefox/Safari
2. Press `F12` or `Cmd+Option+I` to open DevTools
3. Go to **Console** tab
4. Look for these log messages:

```
Connecting to WebSocket: ws://localhost:3000/api/ws/chat
✓ Chat WebSocket connected
```

✓ **PASS**: If you see both messages, WebSocket is connected

**If you see**: `WebSocket error` or no messages
- Check backend is running (`make backend`)
- Check frontend is running (`make frontend`)
- Refresh page (Ctrl+Shift+R to hard refresh)
- Check Network tab → look for `chat` WebSocket connection with status `101`

---

## Step 4: Test Chat UI

### 4a. Find Chat Button
1. Look in the top-right of the header (next to "Map changes, measure impact" badge)
2. Should see a **💬 icon** (chat bubble)

✓ **PASS**: Chat icon visible

### 4b. Open Chat Panel
1. Click the **💬 chat icon**
2. A panel should **slide in from the right side**
3. Panel should show:
   - Title: `💬 Chat`
   - Status: `🟢 Connected` (green circle)
   - Empty message area with "👋 Welcome to chat" text
   - Text input at bottom

✓ **PASS**: Chat panel slides in with status showing connected

### 4c. Close and Reopen
1. Click **💬 icon** again → panel slides out
2. Click **💬 icon** again → panel slides back in

✓ **PASS**: Toggle works smoothly

---

## Step 5: Test Sending Text Messages

### 5a. Type and Send
1. In chat panel, click the text input at bottom
2. Type: `Hello from chat!`
3. Press **Enter** (or click Send button)
4. Check browser console for: `WebSocket not connected` or see message appear

✓ **PASS**: Message appears in chat with your nickname (e.g., "User#5234")

### 5b. Check Message Format
Your message should show:
```
User#5234
Hello from chat!
```
- Left-aligned with blue background
- Username shown above message

✓ **PASS**: Message format correct

### 5c. Test Shift+Enter
1. Click input
2. Type: `Line 1`
3. Press **Shift+Enter**
4. Type: `Line 2`
5. Press **Enter** to send
6. Message should have both lines

✓ **PASS**: Newlines work (Shift+Enter), Send works (Enter)

### 5d. Test Input Disabled When Disconnected
1. Stop backend (Ctrl+C in terminal running `make backend`)
2. Look at chat input → should be **grayed out/disabled**
3. Status should show `🔴 Disconnected`
4. Button should show "Sending..." state

✓ **PASS**: Input disabled on disconnect

---

## Step 6: Test Blast Radius Sharing (Primary Feature)

### 6a. Run Blast Radius Simulation
1. Close chat panel (click 💬 again)
2. On the **left sidebar**, find "ChangeSimulator"
3. Select a service (e.g., **checkout**)
4. Select an endpoint (e.g., **POST /checkout**)
5. Select a change type (e.g., **field_removed**)
6. Click **Simulate** button
7. Right panel should show "Blast Radius" with impact analysis

✓ **PASS**: Blast radius result appears

### 6b. Share to Chat
1. In the Blast Radius panel (right side), look at the header
2. Should see a **Share icon** (📤) next to the X close button
3. Click the **Share icon**
4. Chat panel should **auto-open on the right**
5. Should see a **card** in chat showing:
   ```
   Shared Blast Radius Analysis
   Service: checkout
   Risk: critical
   Impact: 7 service(s)
   ```

✓ **PASS**: Blast radius card appears in chat

### 6c. Check Card Details
Click on the card or expand it to see:
- Service name in cyan/blue
- Risk level with appropriate color (red for critical, orange for high, etc.)
- Number of impacted services

✓ **PASS**: Card shows all details

### 6d. Wait for AI Response
1. After sharing, wait **2-3 seconds**
2. Should see a new message appear from **Lumen AI** (system message)
3. Message should have **cyan border** and say "Lumen AI" above it
4. Contains markdown-formatted analysis (if Claude API enabled)

✓ **PASS**: AI response appears automatically

If no AI response after 3s:
- Check backend logs for error: `AI chat reply failed`
- Make sure `ANTHROPIC_API_KEY` is set in `.env`
- Or use `MOCK_AI=true` for simulated responses

---

## Step 7: Test Multi-Tab/Multi-User Chat

### 7a. Open Two Browser Tabs
1. Already have Tab A open at `http://localhost:3000`
2. Open **New Tab** (Cmd+T)
3. Go to `http://localhost:3000` again (Tab B)
4. Both tabs should auto-assign **different usernames** (e.g., User#1234 and User#5678)

✓ **PASS**: Each browser gets a unique nickname from localStorage

### 7b. Send Message from Tab A
1. In Tab A, click 💬 to open chat
2. Type: `Hello from Tab A`
3. Press Enter

✓ **PASS**: Message appears in Tab A

### 7c. Check Message Appears in Tab B
1. Switch to Tab B
2. Click 💬 to open chat
3. Should see the message from Tab A **instantly**
4. Unread badge on 💬 icon should show **"1"** (red badge)

✓ **PASS**: Real-time message sync between tabs

### 7d. Send Reply from Tab B
1. In Tab B, type: `Hello back from Tab B`
2. Press Enter
3. Switch to Tab A
4. Should see Tab B's message **instantly**
5. Unread badge should increment on Tab A

✓ **PASS**: Bidirectional real-time chat

### 7e. Share Blast Radius from Tab B
1. In Tab B, close chat (click 💬)
2. Run a blast radius simulation (left sidebar)
3. Click Share in the result panel
4. Chat opens and shows the card
5. Switch to Tab A
6. Should see the **same blast radius card** instantly
7. Should see **Lumen AI's response** appearing

✓ **PASS**: Shared analysis syncs in real-time across tabs

---

## Step 8: Test Message History

### 8a. Refresh Page
1. Type several messages and share a blast radius
2. Press **Cmd+R** (or Cmd+Shift+R for hard refresh)
3. Chat panel opens automatically
4. Should show all previous messages (up to 200)

✓ **PASS**: Message history persists across refresh

### 8b. Restart Backend
1. Stop backend (`Ctrl+C`)
2. Messages disappear (expected - stored in-memory)
3. Start backend again (`make backend`)
4. Refresh frontend
5. Chat history is gone (expected behavior)

ℹ️ **NOTE**: This is by design - messages are in-memory only

---

## Step 9: Test Unread Badge

### 9a. Get Unread Count
1. Tab A: Send message
2. Tab B: Click on different view (e.g., "SRB Autopilot") to lose focus
3. Tab A: Send another message to Tab B
4. Look at 💬 icon in Tab B's header
5. Should see **red badge with count** (e.g., "2")

✓ **PASS**: Unread badge shows and increments

### 9b. Clear Unread
1. Click 💬 icon to open chat panel in Tab B
2. Badge should **disappear** immediately
3. Unread count is cleared on panel open

✓ **PASS**: Badge clears when opening chat

---

## Step 10: Test Connection Recovery

### 10a. Network Disconnect
1. DevTools → Network tab → Check "Offline" checkbox
2. Chat status should show `🔴 Disconnected`
3. Input should be disabled
4. Uncheck "Offline"
5. Status should return to `🟢 Connected` within 3 seconds

✓ **PASS**: Auto-reconnect works after network recovery

### 10b. Backend Restart (Simulate Server Restart)
1. Chat is open and connected
2. Stop backend (`Ctrl+C`)
3. Chat status shows `🔴 Disconnected`
4. Start backend again (`make backend`)
5. Chat auto-reconnects within 3 seconds

✓ **PASS**: Auto-reconnect handles server restart

---

## Step 11: Test with MOCK_AI=true (No API Key)

### 11a. Disable Real API
1. Stop backend
2. Edit `backend/.env`:
   ```
   MOCK_AI=true
   # ANTHROPIC_API_KEY=sk-...  (comment out or remove)
   ```
3. Restart backend (`make backend`)

### 11b. Test AI Response
1. Run blast radius and share to chat
2. Wait 2-3 seconds
3. Should see Lumen AI response with **canned markdown**
4. Response should be instant (not calling real API)

✓ **PASS**: Mock AI works without API key

---

## Troubleshooting Table

| Issue | Symptom | Solution |
|-------|---------|----------|
| Chat won't connect | Status shows 🔴 Disconnected | 1. Restart both `make backend` and `make frontend` 2. Hard refresh browser (Cmd+Shift+R) |
| Messages not sending | Input disabled or "WebSocket not connected" | Check backend is running, check Network → WS connection has 101 status |
| No Lumen AI response | Blast radius shared but no AI message | 1. Check backend logs for "AI chat reply failed" 2. Set `ANTHROPIC_API_KEY` or `MOCK_AI=true` 3. Check AI model is `claude-sonnet-4-6` |
| Blast radius card blank | Card appears but no details | Check `blast_radius` object is being serialized properly in Python (use `model_dump()`) |
| Messages appear in one tab only | Message doesn't sync to other tab | Restart both backend and frontend, check that both have same `http://localhost:3000` URL |
| Unread badge stuck | Badge shows count but doesn't clear | Refresh page, click chat icon again |
| Port already in use | `Port 3000 already in use` or `Port 8000 already in use` | `lsof -i :3000` or `lsof -i :8000` then `kill -9 <PID>` |

---

## Quick Test Checklist

Copy-paste this and check off as you go:

```
SETUP
□ Backend running: make backend
□ Frontend running: make frontend
□ DevTools console open

BASIC FUNCTIONALITY
□ Chat icon visible in header
□ Chat panel opens/closes
□ Connection status shows 🟢 Connected

TEXT MESSAGES
□ Can type and send message
□ Message appears with my username
□ Can use Shift+Enter for newlines
□ Input disabled when disconnected

BLAST RADIUS
□ Can run blast radius simulation
□ Share to Chat button appears
□ Shared card appears in chat
□ Lumen AI response appears in 2-3s

MULTI-USER
□ Open second browser tab
□ Message from Tab A appears in Tab B instantly
□ Message from Tab B appears in Tab A instantly
□ Unread badge increments

MESSAGE HISTORY
□ Refresh page shows previous messages
□ Hard refresh (Cmd+Shift+R) reloads history

AUTO-RECONNECT
□ Stop backend → Chat disconnects (🔴)
□ Start backend → Chat reconnects (🟢) within 3s

EDGE CASES
□ Ctrl+Shift+R hard refresh → messages still there
□ Close panel and reopen → messages still there
□ Disable network (DevTools) → reconnects when enabled
□ Multiple blast radius shares → all appear in order
```

---

## Video Test Walkthrough (If Recording)

1. Start both servers
2. Open DevTools console
3. Open browser at http://localhost:3000
4. Show chat icon, open panel, show 🟢 Connected
5. Type message, send, show it appears
6. Run blast radius in left sidebar
7. Click Share to Chat
8. Show card appears instantly
9. Wait 2-3s and show AI response appears
10. Open second tab with same URL
11. Send message from Tab 1 to Tab 2 (show real-time sync)
12. Share another blast radius from Tab 2
13. Show it appears in Tab 1 with AI response

---

## Load Test (Optional)

If you want to stress-test the chat:

```python
# In browser console:
for (let i = 0; i < 50; i++) {
  setTimeout(() => {
    document.querySelector('textarea').value = `Message ${i}`;
    document.querySelector('button[type="submit"]').click();
  }, i * 100);
}
```

- Should see 50 messages appear rapidly
- Backend should handle all without errors
- Chat should remain responsive

✓ **PASS**: Backend handles burst traffic

---

## Final Sign-Off

When all steps pass, the chat feature is **fully functional**. You can:

✅ Send text messages in real-time  
✅ Share blast radius analyses  
✅ Get AI commentary automatically  
✅ Sync across multiple browser tabs  
✅ See unread notifications  
✅ Auto-reconnect on connection loss  
