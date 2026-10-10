plugins {
    id("com.android.application")
}

android {
    namespace = "com.spxtools.workstationabbtga"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.spxtools.workstationabbtga"
        minSdk = 23
        targetSdk = 35
        versionCode = 3
        versionName = "1.0.2"
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
