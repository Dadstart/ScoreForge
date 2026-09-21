using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Threading;

namespace ScoreForge.Controls;

/// <summary>
/// Full-overlay particle fireworks celebration.
/// </summary>
public sealed class FireworksControl : Control
{
    public static readonly StyledProperty<bool> IsPlayingProperty =
        AvaloniaProperty.Register<FireworksControl, bool>(nameof(IsPlaying));

    public static readonly StyledProperty<string?> WinnerNameProperty =
        AvaloniaProperty.Register<FireworksControl, string?>(nameof(WinnerName));

    private static readonly Color[] Palette =
    [
        Color.FromRgb(255, 215, 64),
        Color.FromRgb(255, 82, 82),
        Color.FromRgb(68, 138, 255),
        Color.FromRgb(105, 240, 174),
        Color.FromRgb(224, 64, 251),
        Color.FromRgb(255, 171, 64),
        Color.FromRgb(255, 255, 255)
    ];

    private readonly List<Particle> _particles = [];
    private readonly List<Rocket> _rockets = [];
    private readonly Random _random = new();
    private DispatcherTimer? _timer;
    private TimeSpan _elapsed;
    private TimeSpan _nextLaunch;
    private bool _finishing;

    public bool IsPlaying
    {
        get => GetValue(IsPlayingProperty);
        set => SetValue(IsPlayingProperty, value);
    }

    public string? WinnerName
    {
        get => GetValue(WinnerNameProperty);
        set => SetValue(WinnerNameProperty, value);
    }

    static FireworksControl()
    {
        AffectsRender<FireworksControl>(IsPlayingProperty, WinnerNameProperty);
        IsHitTestVisibleProperty.OverrideDefaultValue<FireworksControl>(false);
    }

    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);

        if (change.Property == IsPlayingProperty)
        {
            if (change.GetNewValue<bool>())
                Start();
            else
                Stop();
        }
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        Stop();
        base.OnDetachedFromVisualTree(e);
    }

    private void Start()
    {
        Stop();
        _particles.Clear();
        _rockets.Clear();
        _elapsed = TimeSpan.Zero;
        _nextLaunch = TimeSpan.Zero;
        _finishing = false;

        _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(16) };
        _timer.Tick += OnTick;
        _timer.Start();

        // Opening barrage
        for (var i = 0; i < 3; i++)
            LaunchRocket(immediateBurst: true);
    }

    private void Stop()
    {
        if (_timer is null)
            return;

        _timer.Tick -= OnTick;
        _timer.Stop();
        _timer = null;
        _particles.Clear();
        _rockets.Clear();
        InvalidateVisual();
    }

    private void OnTick(object? sender, EventArgs e)
    {
        var dt = 0.016;
        _elapsed += TimeSpan.FromSeconds(dt);

        var width = Bounds.Width;
        var height = Bounds.Height;
        if (width <= 0 || height <= 0)
            return;

        if (!_finishing && _elapsed < TimeSpan.FromSeconds(5.5) && _elapsed >= _nextLaunch)
        {
            LaunchRocket(immediateBurst: false);
            _nextLaunch = _elapsed + TimeSpan.FromMilliseconds(_random.Next(180, 420));
        }
        else if (_elapsed >= TimeSpan.FromSeconds(5.5))
        {
            _finishing = true;
        }

        for (var i = _rockets.Count - 1; i >= 0; i--)
        {
            var rocket = _rockets[i];
            rocket.Vy += 18 * dt;
            rocket.X += rocket.Vx * dt;
            rocket.Y += rocket.Vy * dt;
            rocket.Life -= dt;

            if (rocket.Y <= rocket.BurstAtY || rocket.Life <= 0 || rocket.Vy > 40)
            {
                Burst(rocket.X, rocket.Y, rocket.Color);
                _rockets.RemoveAt(i);
            }
            else
            {
                _rockets[i] = rocket;
            }
        }

        for (var i = _particles.Count - 1; i >= 0; i--)
        {
            var p = _particles[i];
            p.Vy += 120 * dt;
            p.Vx *= 0.985;
            p.X += p.Vx * dt;
            p.Y += p.Vy * dt;
            p.Life -= dt;
            p.Radius *= 0.995;

            if (p.Life <= 0 || p.Y > height + 20)
                _particles.RemoveAt(i);
            else
                _particles[i] = p;
        }

        if (_finishing && _rockets.Count == 0 && _particles.Count == 0)
        {
            // Keep banner visible; stop spawning but leave IsPlaying true until VM clears it
            // Soft end: stop timer after a short hold once particles die — actually keep drawing winner text
            // Restart a gentle trickle? Better stop timer and leave one final Invalidate for text-only
            if (_timer is not null && _elapsed > TimeSpan.FromSeconds(7))
            {
                _timer.Tick -= OnTick;
                _timer.Stop();
                _timer = null;
            }
        }

        InvalidateVisual();
    }

    private void LaunchRocket(bool immediateBurst)
    {
        var width = Math.Max(Bounds.Width, 100);
        var height = Math.Max(Bounds.Height, 100);
        var color = Palette[_random.Next(Palette.Length)];
        var x = width * (0.15 + _random.NextDouble() * 0.7);
        var startY = height + 10;
        var burstY = height * (0.18 + _random.NextDouble() * 0.35);

        if (immediateBurst)
        {
            Burst(x, burstY, color);
            return;
        }

        _rockets.Add(new Rocket
        {
            X = x,
            Y = startY,
            Vx = (_random.NextDouble() - 0.5) * 40,
            Vy = -Math.Sqrt(2 * 180 * (startY - burstY)) * (0.85 + _random.NextDouble() * 0.25),
            BurstAtY = burstY,
            Life = 2.5,
            Color = color
        });
    }

    private void Burst(double x, double y, Color color)
    {
        var count = _random.Next(28, 48);
        for (var i = 0; i < count; i++)
        {
            var angle = _random.NextDouble() * Math.PI * 2;
            var speed = 60 + _random.NextDouble() * 160;
            var sparkColor = _random.NextDouble() < 0.25
                ? Palette[_random.Next(Palette.Length)]
                : color;

            _particles.Add(new Particle
            {
                X = x,
                Y = y,
                Vx = Math.Cos(angle) * speed,
                Vy = Math.Sin(angle) * speed,
                Life = 0.7 + _random.NextDouble() * 1.1,
                MaxLife = 1.8,
                Radius = 1.6 + _random.NextDouble() * 2.4,
                Color = sparkColor
            });
        }

        // Secondary glitter ring
        for (var i = 0; i < 12; i++)
        {
            var angle = i / 12.0 * Math.PI * 2;
            _particles.Add(new Particle
            {
                X = x,
                Y = y,
                Vx = Math.Cos(angle) * 40,
                Vy = Math.Sin(angle) * 40,
                Life = 1.2,
                MaxLife = 1.2,
                Radius = 1.2,
                Color = Colors.White
            });
        }
    }

    public override void Render(DrawingContext context)
    {
        if (!IsPlaying)
            return;

        var bounds = new Rect(Bounds.Size);
        if (bounds.Width <= 0 || bounds.Height <= 0)
            return;

        // Dim veil
        context.FillRectangle(new SolidColorBrush(Color.FromArgb(140, 8, 6, 18)), bounds);

        foreach (var rocket in _rockets)
        {
            var brush = new SolidColorBrush(rocket.Color);
            context.DrawEllipse(brush, null, new Point(rocket.X, rocket.Y), 2.5, 2.5);
            // trail
            context.DrawLine(
                new Pen(new SolidColorBrush(rocket.Color) { Opacity = 0.45 }, 2),
                new Point(rocket.X, rocket.Y),
                new Point(rocket.X - rocket.Vx * 0.04, rocket.Y - rocket.Vy * 0.04));
        }

        foreach (var p in _particles)
        {
            var alpha = Math.Clamp(p.Life / Math.Max(p.MaxLife, 0.01), 0, 1);
            var c = Color.FromArgb((byte)(alpha * 255), p.Color.R, p.Color.G, p.Color.B);
            context.DrawEllipse(new SolidColorBrush(c), null, new Point(p.X, p.Y), p.Radius, p.Radius);
        }

        var name = string.IsNullOrWhiteSpace(WinnerName) ? "Winner!" : $"{WinnerName} wins!";
        var typeface = new Typeface("Segoe UI", FontStyle.Normal, FontWeight.Bold);
        var text = new FormattedText(
            name,
            System.Globalization.CultureInfo.CurrentCulture,
            FlowDirection.LeftToRight,
            typeface,
            Math.Clamp(bounds.Width / 14, 28, 56),
            Brushes.White);

        var subtitle = new FormattedText(
            "Cribbage",
            System.Globalization.CultureInfo.CurrentCulture,
            FlowDirection.LeftToRight,
            new Typeface("Segoe UI", FontStyle.Normal, FontWeight.SemiBold),
            18,
            new SolidColorBrush(Color.FromRgb(255, 215, 64)));

        var cx = bounds.Width / 2;
        var cy = bounds.Height * 0.42;
        context.DrawText(text, new Point(cx - text.Width / 2, cy - text.Height / 2));
        context.DrawText(subtitle, new Point(cx - subtitle.Width / 2, cy + text.Height * 0.55));
    }

    private struct Particle
    {
        public double X;
        public double Y;
        public double Vx;
        public double Vy;
        public double Life;
        public double MaxLife;
        public double Radius;
        public Color Color;
    }

    private struct Rocket
    {
        public double X;
        public double Y;
        public double Vx;
        public double Vy;
        public double BurstAtY;
        public double Life;
        public Color Color;
    }
}
