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
        versionCode = 5
        versionName = "1.0.4"
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

dependencies {
    implementation("androidx.core:core:1.15.0")
}
