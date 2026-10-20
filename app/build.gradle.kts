plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "com.hasbreo.message"
    compileSdk = 36
    buildToolsVersion = "36.0.0"
    defaultConfig {
        applicationId = "com.hasbreo.message"
        minSdk = 30
        targetSdk = 36
        versionCode = 10200
        versionName = "1.2.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildTypes { release { isMinifyEnabled = false; isShrinkResources = false } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    lint { abortOnError = true; checkReleaseBuilds = true }
}
dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-ktx:1.11.0")
    implementation("com.google.android.gms:play-services-wearable:20.0.1")
    testImplementation("junit:junit:4.13.2")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.fragment:fragment-ktx:1.8.9")
    implementation("androidx.biometric:biometric:1.1.0")
}

val buildWeb by tasks.registering(Exec::class) {
    workingDir(rootProject.file("web"))
    commandLine("npm", "run", "build")
    inputs.dir(rootProject.file("web/src")); inputs.dir(rootProject.file("web/public"))
    outputs.dir(rootProject.file("web/dist"))
}
val copyWeb by tasks.registering(Sync::class) {
    dependsOn(buildWeb)
    from(rootProject.file("web/dist"))
    into(layout.buildDirectory.dir("generated/hasbreoAssets"))
}
android.sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/hasbreoAssets"))
tasks.named("preBuild") { dependsOn(copyWeb) }
