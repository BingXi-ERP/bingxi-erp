use std::path::PathBuf;

#[test]
fn shared_utils_do_not_depend_on_middleware_for_constants() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src");
    for relative in ["utils/error.rs", "utils/response.rs", "utils/cache.rs"] {
        let path = root.join(relative);
        let source = std::fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("读取 {path:?} 失败: {error}"));
        assert!(
            !source.contains("use crate::middleware"),
            "{relative} 不得为共享常量反向依赖 middleware"
        );
    }
}
