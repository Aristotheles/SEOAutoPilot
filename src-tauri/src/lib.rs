#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    fs::OpenOptions,
    net::TcpStream,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::Duration,
};
use tauri::{Manager, RunEvent};

struct BackendProcess(Mutex<Option<Child>>);

fn backend_is_ready() -> bool {
    TcpStream::connect_timeout(
        &"127.0.0.1:4173".parse().expect("valid local address"),
        Duration::from_millis(250),
    )
    .is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            if backend_is_ready() {
                return Err("127.0.0.1:4173 başka bir uygulama tarafından kullanılıyor. Önce o uygulamayı kapatın.".into());
            }

            let resource_dir = app.path().resource_dir()?;
            let backend_dir = resource_dir.join("backend");
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let log = OpenOptions::new()
                .create(true)
                .append(true)
                .open(data_dir.join("desktop-backend.log"))?;

            let mut command = Command::new(resource_dir.join("node.exe"));
            command
                .arg("server.js")
                .current_dir(&backend_dir)
                .env("SEO_AUTOPILOT_DATA_DIR", &data_dir)
                .env("PORT", "4173")
                .stdin(Stdio::null())
                .stdout(Stdio::from(log.try_clone()?))
                .stderr(Stdio::from(log));
            #[cfg(windows)]
            command.creation_flags(0x08000000);
            let child = command.spawn()?;
            app.manage(BackendProcess(Mutex::new(Some(child))));

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                for _ in 0..80 {
                    if backend_is_ready() {
                        if let Some(window) = handle.get_webview_window("main") {
                            let _ = window.navigate(
                                "http://127.0.0.1:4173"
                                    .parse()
                                    .expect("valid application URL"),
                            );
                        }
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(125));
                }
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.set_title("SEOAutoPilot — başlatılamadı");
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("SEOAutoPilot başlatılamadı");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            if let Some(process) = app_handle.try_state::<BackendProcess>() {
                if let Ok(mut child) = process.0.lock() {
                    if let Some(child) = child.take() {
                        let mut child = child;
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        }
    });
}
