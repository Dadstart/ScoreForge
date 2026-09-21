using System.Collections.Specialized;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using ScoreForge.ViewModels;

namespace ScoreForge.Controls;

/// <summary>
/// Renders a traditional cribbage board: serpentine 120-hole tracks plus finish,
/// with front and rear pegs for each player.
/// </summary>
public sealed class CribbageBoardControl : Control
{
    private const int TrackLength = 120;
    private const int Streets = 4;
    private const int HolesPerStreet = 30;

    public static readonly StyledProperty<IList<CribbagePlayerViewModel>?> PlayersProperty =
        AvaloniaProperty.Register<CribbageBoardControl, IList<CribbagePlayerViewModel>?>(nameof(Players));

    public static readonly StyledProperty<int> TargetScoreProperty =
        AvaloniaProperty.Register<CribbageBoardControl, int>(nameof(TargetScore), 121);

    private INotifyCollectionChanged? _subscribedCollection;

    public IList<CribbagePlayerViewModel>? Players
    {
        get => GetValue(PlayersProperty);
        set => SetValue(PlayersProperty, value);
    }

    public int TargetScore
    {
        get => GetValue(TargetScoreProperty);
        set => SetValue(TargetScoreProperty, value);
    }

    static CribbageBoardControl()
    {
        AffectsRender<CribbageBoardControl>(PlayersProperty, TargetScoreProperty);
    }

    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);

        if (change.Property == PlayersProperty)
        {
            UnsubscribePlayers();
            SubscribePlayers(change.NewValue as IList<CribbagePlayerViewModel>);
            InvalidateVisual();
        }
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        UnsubscribePlayers();
        base.OnDetachedFromVisualTree(e);
    }

    private void SubscribePlayers(IList<CribbagePlayerViewModel>? players)
    {
        if (players is INotifyCollectionChanged notify)
        {
            notify.CollectionChanged += OnPlayersCollectionChanged;
            _subscribedCollection = notify;
        }

        if (players is null)
            return;

        foreach (var player in players)
            player.PropertyChanged += OnPlayerPropertyChanged;
    }

    private void UnsubscribePlayers()
    {
        if (_subscribedCollection is not null)
        {
            _subscribedCollection.CollectionChanged -= OnPlayersCollectionChanged;
            _subscribedCollection = null;
        }

        if (Players is null)
            return;

        foreach (var player in Players)
            player.PropertyChanged -= OnPlayerPropertyChanged;
    }

    private void OnPlayersCollectionChanged(object? sender, NotifyCollectionChangedEventArgs e) =>
        InvalidateVisual();

    private void OnPlayerPropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
    {
        if (e.PropertyName is nameof(CribbagePlayerViewModel.FrontPeg)
            or nameof(CribbagePlayerViewModel.RearPeg)
            or nameof(CribbagePlayerViewModel.IsSelected)
            or nameof(CribbagePlayerViewModel.IsWinner))
        {
            InvalidateVisual();
        }
    }

    public override void Render(DrawingContext context)
    {
        var bounds = new Rect(Bounds.Size);
        if (bounds.Width <= 0 || bounds.Height <= 0)
            return;

        var boardBrush = new SolidColorBrush(Color.FromRgb(92, 58, 32));
        var edgeBrush = new SolidColorBrush(Color.FromRgb(58, 34, 18));
        var holeBrush = new SolidColorBrush(Color.FromRgb(28, 18, 10));
        var labelBrush = new SolidColorBrush(Color.FromRgb(230, 214, 180));

        context.FillRectangle(edgeBrush, bounds, 12);
        var inset = bounds.Deflate(6);
        context.FillRectangle(boardBrush, inset, 10);

        var players = Players;
        if (players is null || players.Count == 0)
            return;

        var trackCount = players.Count;
        var padding = 18.0;
        var headerHeight = 28.0;
        var usable = inset.Deflate(padding);
        usable = new Rect(usable.X, usable.Y + headerHeight, usable.Width, usable.Height - headerHeight);

        var trackGap = 14.0;
        var trackHeight = (usable.Height - trackGap * (trackCount - 1)) / trackCount;
        var typeface = new Typeface("Segoe UI");

        for (var t = 0; t < trackCount; t++)
        {
            var player = players[t];
            var trackTop = usable.Y + t * (trackHeight + trackGap);
            var trackRect = new Rect(usable.X, trackTop, usable.Width, trackHeight);

            var title = player.IsWinner ? $"{player.Name} — winner" : $"{player.Name}  {player.Total}";
            context.DrawText(
                new FormattedText(
                    title,
                    System.Globalization.CultureInfo.CurrentCulture,
                    FlowDirection.LeftToRight,
                    typeface,
                    14,
                    player.IsSelected ? Brushes.White : labelBrush),
                new Point(trackRect.X, trackRect.Y - 20));

            DrawTrack(context, trackRect, holeBrush, player, labelBrush);
        }

        // Start / finish labels
        context.DrawText(
            new FormattedText(
                "START",
                System.Globalization.CultureInfo.CurrentCulture,
                FlowDirection.LeftToRight,
                typeface,
                11,
                labelBrush),
            new Point(inset.X + padding, inset.Y + 4));

        context.DrawText(
            new FormattedText(
                $"FINISH {TargetScore}",
                System.Globalization.CultureInfo.CurrentCulture,
                FlowDirection.LeftToRight,
                typeface,
                11,
                labelBrush),
            new Point(inset.Right - padding - 80, inset.Y + 4));
    }

    private static void DrawTrack(
        DrawingContext context,
        Rect trackRect,
        IBrush holeBrush,
        CribbagePlayerViewModel player,
        IBrush labelBrush)
    {
        var streetGap = 6.0;
        var streetHeight = (trackRect.Height - streetGap * (Streets - 1)) / Streets;
        var holeRadius = Math.Min(streetHeight * 0.28, trackRect.Width / (HolesPerStreet * 2.4));

        Point HoleCenter(int holeNumber)
        {
            // holeNumber 1..120 on track; 0 = start; 121+ = finish
            if (holeNumber <= 0)
            {
                return new Point(trackRect.X + holeRadius * 1.2, trackRect.Y + streetHeight * 0.5);
            }

            if (holeNumber > TrackLength)
            {
                return new Point(
                    trackRect.Right - holeRadius * 1.2,
                    trackRect.Y + (Streets - 1) * (streetHeight + streetGap) + streetHeight * 0.5);
            }

            var index = holeNumber - 1; // 0..119
            var street = index / HolesPerStreet; // 0..3
            var posInStreet = index % HolesPerStreet; // 0..29
            var goingRight = street % 2 == 0;
            var col = goingRight ? posInStreet : (HolesPerStreet - 1 - posInStreet);

            var y = trackRect.Y + street * (streetHeight + streetGap) + streetHeight * 0.5;
            var usableWidth = trackRect.Width - holeRadius * 4;
            var x = trackRect.X + holeRadius * 2 + (col + 0.5) * (usableWidth / HolesPerStreet);
            return new Point(x, y);
        }

        for (var hole = 1; hole <= TrackLength; hole++)
        {
            var center = HoleCenter(hole);
            context.DrawEllipse(holeBrush, null, center, holeRadius, holeRadius);

            // Street markers every 5 holes
            if (hole % 5 == 0)
            {
                context.DrawEllipse(
                    new SolidColorBrush(Color.FromRgb(160, 120, 70)),
                    null,
                    center,
                    holeRadius * 0.35,
                    holeRadius * 0.35);
            }
        }

        // Finish hole
        var finish = HoleCenter(TrackLength + 1);
        context.DrawEllipse(
            new SolidColorBrush(Color.FromRgb(200, 170, 90)),
            new Pen(labelBrush, 1.5),
            finish,
            holeRadius * 1.15,
            holeRadius * 1.15);

        var pegRadius = holeRadius * 1.35;
        DrawPeg(context, HoleCenter(player.RearPeg), player.PegColor, pegRadius, dimmed: true);
        DrawPeg(context, HoleCenter(player.FrontPeg), player.PegColor, pegRadius, dimmed: false);
    }

    private static void DrawPeg(DrawingContext context, Point center, Color color, double radius, bool dimmed)
    {
        var brush = new SolidColorBrush(color) { Opacity = dimmed ? 0.55 : 1.0 };
        var outline = new Pen(new SolidColorBrush(Color.FromArgb(180, 20, 12, 8)), dimmed ? 1 : 1.5);
        context.DrawEllipse(brush, outline, center, radius, radius);

        // highlight
        context.DrawEllipse(
            new SolidColorBrush(Colors.White) { Opacity = dimmed ? 0.15 : 0.35 },
            null,
            new Point(center.X - radius * 0.25, center.Y - radius * 0.3),
            radius * 0.35,
            radius * 0.25);
    }
}
