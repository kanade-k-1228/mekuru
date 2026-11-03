use std::{env, fs, path::Path};

fn collect(dir: &Path, base: &Path, entries: &mut Vec<(String, String)>) {
    let mut paths: Vec<_> = fs::read_dir(dir).unwrap().map(|e| e.unwrap().path()).collect();
    paths.sort();
    for path in paths {
        if path.is_dir() {
            collect(&path, base, entries);
        } else {
            entries.push((
                path.strip_prefix(base).unwrap().to_string_lossy().replace('\\', "/"),
                path.to_string_lossy().into_owned(),
            ));
        }
    }
}

fn main() {
    let dir = Path::new(&env::var("CARGO_MANIFEST_DIR").unwrap()).join("viewer");
    println!("cargo:rerun-if-changed={}", dir.display());
    let mut entries = vec![];
    if dir.join("index.html").is_file() {
        collect(&dir, &dir, &mut entries);
    } else if env::var("PROFILE").unwrap() == "release" {
        panic!("build the embedded viewer first: bun install && bun run --cwd pkgs/viewer build");
    } else {
        println!("cargo:warning=Viewer not built; run bun run build for an embedded browser UI");
    }
    let mut source = String::from("const ASSETS: &[(&str, &[u8])] = &[\n");
    for (name, path) in entries {
        source.push_str(&format!("({name:?}, include_bytes!({path:?})),\n"));
    }
    source.push_str("];\n");
    fs::write(Path::new(&env::var("OUT_DIR").unwrap()).join("viewer.rs"), source).unwrap();
}
