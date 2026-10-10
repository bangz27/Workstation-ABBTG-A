# Workstation ABBTG-A for Android

This is the first Android shell for the existing Workstation web application.

## Update behavior

- **Website updates:** changes deployed to https://workstation-abbtg-a.vercel.app are loaded by the installed app on its next page load. No APK rebuild is needed for ordinary web UI, dashboard, or backend-connected feature changes.
- **Android shell updates:** changes to native Android code, app permissions, launcher icon, or embedded app behavior require a new APK build. Android does not allow a sideloaded app to silently replace itself. A signed release/update flow will be added before production distribution.

## Build

The GitHub Actions workflow builds a debug APK and uploads it as an artifact. Debug APKs are for initial device testing only; they are not the production release/signing setup.

Application ID: `com.spxtools.workstationabbtga`
Minimum Android version: Android 6.0 (API 23)
