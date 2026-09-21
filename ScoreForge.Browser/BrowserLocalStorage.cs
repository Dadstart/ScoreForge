using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;

namespace ScoreForge.Browser;

[SupportedOSPlatform("browser")]
public static partial class BrowserLocalStorage
{
    [JSImport("globalThis.localStorage.getItem")]
    public static partial string? GetItem(string key);

    [JSImport("globalThis.localStorage.setItem")]
    public static partial void SetItem(string key, string value);
}
