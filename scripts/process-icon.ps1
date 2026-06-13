Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $env:USERPROFILE "Proyectos\GymApp\assets\images"
$src = Join-Path $outDir "AppIcon.png"

$cs = @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;

public static class IconProc
{
    // Flood-fill the connected white background from the borders and turn it
    // transparent, feathering the soft drop-shadow so there is no hard edge.
    public static Bitmap RemoveWhiteBackground(Bitmap src)
    {
        int w = src.Width, h = src.Height;
        Bitmap bmp = new Bitmap(src);
        Rectangle rect = new Rectangle(0, 0, w, h);
        BitmapData data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        int bytes = Math.Abs(data.Stride) * h;
        byte[] buf = new byte[bytes];
        System.Runtime.InteropServices.Marshal.Copy(data.Scan0, buf, 0, bytes);
        int stride = data.Stride;

        bool[] visited = new bool[w * h];
        Queue<int> q = new Queue<int>();

        // mMin: a pixel only counts as background while its darkest channel is
        // still bright. The flood stops once it reaches the dark icon body.
        int mMin = 205;   // below this we are clearly on the icon
        int mFull = 235;  // above this it is pure background -> alpha 0

        Action<int,int> seed = (x, y) =>
        {
            int idx = y * w + x;
            if (visited[idx]) return;
            int o = y * stride + x * 4;
            int b = buf[o], g = buf[o + 1], r = buf[o + 2];
            int m = Math.Min(r, Math.Min(g, b));
            if (m >= mMin) { visited[idx] = true; q.Enqueue(idx); }
        };

        for (int x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
        for (int y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }

        int[] dx = { 1, -1, 0, 0 };
        int[] dy = { 0, 0, 1, -1 };

        while (q.Count > 0)
        {
            int idx = q.Dequeue();
            int x = idx % w, y = idx / w;
            int o = y * stride + x * 4;
            int b = buf[o], g = buf[o + 1], r = buf[o + 2];
            int m = Math.Min(r, Math.Min(g, b));

            // Feather alpha: pure white -> 0, shadow gray near icon -> up to 255.
            int alpha;
            if (m >= mFull) alpha = 0;
            else alpha = (int)((double)(mFull - m) / (mFull - mMin) * 255.0);
            if (alpha < 0) alpha = 0; if (alpha > 255) alpha = 255;
            buf[o + 3] = (byte)alpha;

            for (int k = 0; k < 4; k++)
            {
                int nx = x + dx[k], ny = y + dy[k];
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                int nidx = ny * w + nx;
                if (visited[nidx]) continue;
                int no = ny * stride + nx * 4;
                int nb = buf[no], ng = buf[no + 1], nr = buf[no + 2];
                int nm = Math.Min(nr, Math.Min(ng, nb));
                if (nm >= mMin) { visited[nidx] = true; q.Enqueue(nidx); }
            }
        }

        System.Runtime.InteropServices.Marshal.Copy(buf, 0, data.Scan0, bytes);
        bmp.UnlockBits(data);
        return bmp;
    }

    public static Bitmap Resize(Bitmap src, int size)
    {
        Bitmap dst = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (Graphics gfx = Graphics.FromImage(dst))
        {
            gfx.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            gfx.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
            gfx.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            gfx.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighQuality;
            gfx.Clear(Color.Transparent);
            gfx.DrawImage(src, new Rectangle(0, 0, size, size));
        }
        return dst;
    }

    // Composite a transparent image over a solid square (for the iOS icon,
    // which does not support alpha and would otherwise get black corners).
    public static Bitmap OnBackground(Bitmap src, int size, Color bg)
    {
        Bitmap dst = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (Graphics gfx = Graphics.FromImage(dst))
        {
            gfx.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            gfx.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
            gfx.Clear(bg);
            gfx.DrawImage(src, new Rectangle(0, 0, size, size));
        }
        return dst;
    }
}
"@

Add-Type -TypeDefinition $cs -ReferencedAssemblies System.Drawing

$orig = [System.Drawing.Image]::FromFile($src)
$transparent = [IconProc]::RemoveWhiteBackground($orig)

# In-app logo + Android adaptive foreground: transparent background, 1024px.
$logo = [IconProc]::Resize($transparent, 1024)
$logo.Save("$outDir\logo.png", [System.Drawing.Imaging.ImageFormat]::Png)

# iOS / main app icon: composite on the dark color of the icon body (no alpha).
$dark = [System.Drawing.Color]::FromArgb(255, 12, 12, 14)
$appIcon = [IconProc]::OnBackground($transparent, 1024, $dark)
$appIcon.Save("$outDir\app-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Splash uses the transparent logo too.
$splash = [IconProc]::Resize($transparent, 512)
$splash.Save("$outDir\splash-logo.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Report a few sample alpha values to confirm the result.
$check = New-Object System.Drawing.Bitmap("$outDir\logo.png")
$corner = $check.GetPixel(5,5)
$center = $check.GetPixel(512,512)
"logo.png corner(5,5)  -> A=$($corner.A) R=$($corner.R) G=$($corner.G) B=$($corner.B)"
"logo.png center       -> A=$($center.A) R=$($center.R) G=$($center.G) B=$($center.B)"
"Saved: logo.png (1024, transparent), app-icon.png (1024, dark bg), splash-logo.png (512, transparent)"
$check.Dispose(); $orig.Dispose(); $transparent.Dispose(); $logo.Dispose(); $appIcon.Dispose(); $splash.Dispose()
