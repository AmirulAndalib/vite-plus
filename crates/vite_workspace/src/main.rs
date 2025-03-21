use std::env::current_dir;
use tiny_http::{Header, Response};
use vite_workspace::get_package_graph;

fn main() -> anyhow::Result<()> {
    let workspace_root =
        std::env::args_os().nth(1).unwrap_or_else(|| current_dir().unwrap().into_os_string());
    let package_graph = get_package_graph(workspace_root)?;

    println!(
        "Package graph built on {} packages and {} edges",
        package_graph.node_count(),
        package_graph.edge_count()
    );
    let graph_json = serde_json::to_vec(&package_graph)?;
    let server = tiny_http::Server::http("127.0.0.1:0").map_err(|err| anyhow::anyhow!(err))?;

    let port = server.server_addr().to_ip().unwrap().port();
    let url = format!("http://localhost:{port}/");
    println!("Serving the package graph visualization at {url}...");
    if let Err(err) = webbrowser::open(&url) {
        eprintln!("Failed to open {url} with the default browser: {err}");
    }
    for request in server.incoming_requests() {
        let url = request.url();
        let path = if let Some((path, _)) = url.split_once('?') { path } else { url };
        let response = match path {
            "/" => Response::from_data(include_bytes!("../web/dist/index.html")).with_header(
                Header::from_bytes(b"content-type", "text/html; charset=utf-8").unwrap(),
            ),
            "/graph.json" => Response::from_data(graph_json.clone())
                .with_header(Header::from_bytes(b"content-type", "application/json").unwrap()),
            _ => Response::from_string("Not Found").with_status_code(404),
        };
        request.respond(response)?;
    }

    Ok(())
}
