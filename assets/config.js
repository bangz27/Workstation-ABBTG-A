/* Public client config. The publishable key is meant to be public: every table is protected by RLS
   (SELECT only for signed-in users). Never put a service_role / secret key here. */
window.SPX_CONFIG = {
  SUPABASE_URL: 'https://bkmvwgoldyrzmgvmeskp.supabase.co',
  SUPABASE_KEY: 'sb_publishable_glOfpLrNGGdz95Qt62eVJg_rlzIxqQ_',
  /* Apps Script Web App (ABBTG-A Dashboard Operation) — ปุ่มส่ง SeaTalk; สิทธิ์ตรวจจาก token ล็อกอิน Supabase */
  SEATALK_EXEC_URL: 'https://script.google.com/macros/s/AKfycbwGh3-UCJSwZF3_xTks06RzaArP4ellPP3B81U4ZVvX99cVhET7DCxLombtx2Zf-sXbnA/exec'
};
