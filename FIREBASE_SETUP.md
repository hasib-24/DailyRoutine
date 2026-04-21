# রুটিন প্ল্যানার — Firebase Setup গাইড

## ধাপ ১: Firebase Project তৈরি করো

1. **https://console.firebase.google.com** এ যাও
2. **"Add project"** ক্লিক করো
3. Project name: `routine-planner` (যেকোনো নাম)
4. Google Analytics: চাইলে রাখো বা বন্ধ করো
5. **"Create project"** ক্লিক করো

---

## ধাপ ২: Web App যোগ করো

1. Project dashboard এ **`</>`** (Web) আইকনে ক্লিক করো
2. App nickname: `routine-planner-web`
3. **"Register app"** ক্লিক করো
4. Firebase SDK config কপি করো — এরকম দেখাবে:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

5. এই config **`index.html`** এ বসাও (নির্দিষ্ট জায়গায় আছে)

---

## ধাপ ৩: Authentication চালু করো

1. Firebase Console → **Authentication** → **Get started**
2. **Sign-in method** → **Google** → Enable করো
3. Support email: তোমার Gmail দাও
4. **Save** করো

---

## ধাপ ৪: Firestore Database তৈরি করো

1. Firebase Console → **Firestore Database** → **Create database**
2. **Start in production mode** বেছে নাও
3. Location: `asia-south1` (Mumbai — বাংলাদেশের কাছাকাছি, দ্রুত)
4. **Enable** ক্লিক করো

---

## ধাপ ৫: Firestore Security Rules সেট করো

Firestore Console → **Rules** → নিচের rules বসাও:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // শুধু নিজের ডেটা access করতে পারবে
    match /users/{userId}/tasks/{taskId} {
      allow read, write: if request.auth != null 
                         && request.auth.uid == userId;
    }
    
    // অন্য কেউ অন্যের ডেটা দেখতে পারবে না
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**Publish** করো।

---

## ধাপ ৬: Firebase Authorized Domain যোগ করো

যদি Vercel বা Netlify তে deploy করো:

1. Authentication → **Settings** → **Authorized domains**
2. তোমার domain যোগ করো (যেমন: `routine-planner.vercel.app`)

---

## ধাপ ৭: App Deploy করো

### Vercel (সহজ):
```bash
# GitHub এ push করো
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/routine-planner.git
git push -u origin main
# তারপর vercel.com এ import করো
```

### বা সরাসরি Firebase Hosting:
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

---

## Firestore Data Structure

```
users/
  {userId}/           ← Google UID
    tasks/
      {taskId}/       ← Auto-generated ID
        title: "বাংলা সাহিত্য পড়া"
        category: "bcs"
        date: "2024-12-15"
        time: "10:00"
        details: "৫ম থেকে ৮ম লেকচার"
        priority: "high"
        reminderBefore: 30
        done: false
        createdAt: 1702641600000
        userId: "google-uid-here"
```

---

## Backup ও Restore

- **JSON Backup**: সব tasks JSON ফাইলে নামাও
- **CSV Backup**: Excel এ খোলার জন্য CSV নামাও  
- **Restore**: আগের JSON backup থেকে সব tasks ফিরিয়ে আনো

Backup ফাইল সাথে রাখো — Firebase হারিয়ে গেলেও Restore করতে পারবে।

---

## Smart Reminder Logic

| দিন | Reminder কতবার |
|-----|----------------|
| আজকে | প্রতি ঘন্টায় (সকাল ৮টা - রাত ১০টা) |
| আগামীকাল | প্রতি ৩ ঘন্টায় — বেশি মনে করাবে |
| পরশু | দিনে ৩ বার (৮, ২, ৮টায়) |
| ৩-১০ দিন পরে | দিনে একবার সকাল ৯টায় |

---

## সমস্যা হলে

**"Firebase not initialized"**: `index.html` এ firebaseConfig সঠিকভাবে বসানো হয়েছে কিনা দেখো

**"Permission denied"**: Firestore Rules সঠিকভাবে সেট হয়েছে কিনা দেখো

**"Popup blocked"**: ব্রাউজারে popup allow করো Google Login এর জন্য
