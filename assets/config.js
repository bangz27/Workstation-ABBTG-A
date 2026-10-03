/* Public client config. The publishable key is meant to be public: every table is protected by RLS
   (SELECT only for signed-in users). Never put a service_role / secret key here. */
window.SPX_CONFIG = {
  SUPABASE_URL: 'https://bkmvwgoldyrzmgvmeskp.supabase.co',
  SUPABASE_KEY: 'sb_publishable_glOfpLrNGGdz95Qt62eVJg_rlzIxqQ_'
};
