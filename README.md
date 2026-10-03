# Workstation ABBTG-A

แดชบอร์ดหน้างานของฮับ (Fleet Over View · กะ Fleet · กะ Ops) แบบเว็บนิ่ง (static) บน GitHub Pages
ข้อมูลและการเข้าสู่ระบบอยู่ที่ Supabase — ใน repo นี้ **ไม่มีข้อมูลพนักงาน/คนขับ และไม่มีคีย์ลับ**

## ทำงานอย่างไร

```
Google Sheet ──(Apps Script: Sync.gs ทุกครั้งที่แก้ไข + ทุก 15 นาที)──▶ Supabase (RPC sync_sheet + รหัสลับ)
                                                                          │
                     เว็บนี้ (GitHub Pages) ◀── เข้าสู่ระบบด้วยอีเมล/รหัสผ่าน ──┘  อ่านได้เฉพาะผู้ที่ล็อกอินแล้ว
```

- ทุกตารางเปิด RLS: อ่านได้เฉพาะผู้ใช้ที่ล็อกอิน ไม่มีใครเขียนจากหน้าเว็บได้
- `assets/config.js` มีแค่ URL และ publishable key ของ Supabase ซึ่งเปิดเผยได้ตามปกติ
- ไม่มีปุ่มสมัครสมาชิก — ผู้ดูแลเป็นคนสร้างบัญชีให้

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | หน้าเว็บ + หน้าเข้าสู่ระบบ |
| `assets/style.css` | ธีม (เหมือนเวอร์ชัน Apps Script) |
| `assets/config.js` | URL + publishable key |
| `assets/api.js` | เชื่อม Supabase (`get_daily_report`, `get_roster`) |
| `assets/auth.js` | เข้าสู่ระบบ / ออกจากระบบ / ตั้งรหัสผ่านใหม่ |
| `assets/driver.js` | หน้า Fleet Over View |
| `assets/roster.js` | หน้า กะ Fleet / กะ Ops |

ไม่มีขั้นตอน build — แก้ไฟล์แล้ว push ได้เลย (supabase-js โหลดจาก CDN แบบล็อกเวอร์ชัน + SRI)

## เปิด GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → Branch: `main` / `(root)` → Save

## เพิ่มผู้ใช้

Supabase Dashboard → Authentication → Users → **Add user → Create new user**
ใส่อีเมล + รหัสผ่าน และติ๊ก *Auto Confirm User*

## ทดสอบบนเครื่อง

```
python3 -m http.server 8080
```
แล้วเปิด http://localhost:8080 (ต้องเพิ่ม `http://localhost:8080` ใน Supabase → Authentication → URL Configuration ถ้าจะใช้ลิงก์รีเซ็ตรหัสผ่าน)

> ห้าม commit ไฟล์ข้อมูลจริง ภาพหน้าจอที่มีรายชื่อ หรือรหัสลับ (`SYNC_SECRET`) ลง repo นี้
