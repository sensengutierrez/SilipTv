plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Bilang ng build mula sa GitHub Actions (ito rin ang numero ng release: pos-vN); 1 kapag sa sariling computer
val runNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

// Ang web app (../../web) ang laman ng Android app; kinokopya ito sa assets/www tuwing build.
val webAssets = layout.buildDirectory.dir("generated/webassets")
val copyWeb by tasks.registering(Sync::class) {
    from(rootProject.file("../web"))
    into(webAssets.map { it.dir("www") })
    exclude("sw.js")
}

android {
    namespace = "com.storepos.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.storepos.app"
        minSdk = 23
        targetSdk = 34
        versionCode = runNumber
        versionName = "1.0.$runNumber"
    }

    // Pansariling susi para iisa ang pirma ng bawat build (para ma-update ang app nang hindi binubura).
    signingConfigs {
        create("personal") {
            storeFile = file("personal.keystore")
            storePassword = "silip-tv"
            keyAlias = "silip"
            keyPassword = "silip-tv"
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("personal")
        }
        debug { signingConfig = signingConfigs.getByName("personal") }
    }
    sourceSets["main"].assets.srcDir(webAssets)
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    lint { abortOnError = false; checkReleaseBuilds = false }
}

tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
