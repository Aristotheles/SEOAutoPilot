#[cfg(windows)]
use std::{
    ffi::c_void,
    os::windows::{io::AsRawHandle, process::CommandExt},
};
use std::{
    fs::OpenOptions,
    net::TcpStream,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::Duration,
};
use tauri::{Manager, RunEvent};
#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE},
    System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    },
};

struct BackendProcess {
    child: Mutex<Option<Child>>,
    #[cfg(windows)]
    job_handle: Mutex<Option<usize>>,
}

#[cfg(windows)]
fn assign_kill_on_close_job(child: &Child) -> std::io::Result<usize> {
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return Err(std::io::Error::last_os_error());
        }

        let mut information: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        information.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &information as *const _ as *const c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if configured == 0 {
            let error = std::io::Error::last_os_error();
            CloseHandle(job);
            return Err(error);
        }

        let process_handle = child.as_raw_handle() as HANDLE;
        let assigned = AssignProcessToJobObject(job, process_handle);
        if assigned == 0 {
            let error = std::io::Error::last_os_error();
            CloseHandle(job);
            return Err(error);
        }

        Ok(job as usize)
    }
}

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

            let mut command = Command::new(resource_dir.join("seoautopilot-node.exe"));
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
            let mut child = command.spawn()?;
            #[cfg(windows)]
            let job_handle = match assign_kill_on_close_job(&child) {
                Ok(handle) => handle,
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(error.into());
                }
            };
            app.manage(BackendProcess {
                child: Mutex::new(Some(child)),
                #[cfg(windows)]
                job_handle: Mutex::new(Some(job_handle)),
            });

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
                if let Ok(mut child) = process.child.lock() {
                    if let Some(child) = child.take() {
                        let mut child = child;
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
                #[cfg(windows)]
                if let Ok(mut job_handle) = process.job_handle.lock() {
                    if let Some(job_handle) = job_handle.take() {
                        unsafe {
                            CloseHandle(job_handle as HANDLE);
                        }
                    }
                }
            }
        }
    });
}
