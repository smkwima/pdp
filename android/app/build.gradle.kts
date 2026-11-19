plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "id.sch.smkwima.pdp"
    compileSdk = 35

    defaultConfig {
        applicationId = "id.sch.smkwima.pdp"
        minSdk = 29            // Android 10+ (simpan ke folder Download tanpa izin penyimpanan)
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    // Kunci tanda tangan tetap (pdp-wima.jks) supaya APK versi baru bisa menimpa versi lama.
    // Jangan hilangkan file ini; tanpa kunci yang sama, HP harus uninstall dulu sebelum memasang versi baru.
    signingConfigs {
        create("pdp") {
            storeFile = file("pdp-wima.jks")
            storePassword = "pdpwima2026"
            keyAlias = "pdpwima"
            keyPassword = "pdpwima2026"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("pdp")
        }
        debug {
            signingConfig = signingConfigs.getByName("pdp")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
}
