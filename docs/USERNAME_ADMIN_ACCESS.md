# Username login and account permissions

This feature is staged on `feature/username-admin-access`; it is not active in production until the database migration and both Edge Functions are deployed and the PR is merged.

## Deployment order
1. Review and apply `supabase/migrations/20261012100000_username_admin_access.sql` to the Workstation ABBTG-A Supabase project.
2. Deploy `username-auth` with JWT verification **disabled**. This endpoint must accept unauthenticated login requests but only returns a session after Supabase Auth validates the username mapping and password.
3. Deploy `user-admin` with JWT verification **enabled**. It independently validates the caller and requires `private.is_admin()` plus an active account.
4. Merge the PR and verify Vercel Production.
5. Test username and legacy email login, account creation, denied access, each page permission, OT write permission, password reset, and suspended-account sign-out before declaring verified.

## Safety notes
- The service-role key is used only inside Edge Functions.
- Browser access to `workstation_accounts` and `workstation_accounts_lookup` is revoked; the lookup view is for service-role functions only.
- Existing accounts are backfilled with current page-read access to avoid accidental lockout.
- New accounts receive no page access unless the administrator grants it.
- Leave CRUD continues to use existing leave permissions as a compatibility path, while account-level leave management can also authorize the operation.
- No existing owner-source data or Google Sheet sync logic is modified.
- The username login function must have gateway JWT verification disabled because the user is not signed in yet; password validation still occurs through Supabase Auth.
