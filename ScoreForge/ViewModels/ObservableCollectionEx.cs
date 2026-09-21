using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.ComponentModel;

namespace ScoreForge.ViewModels;

/// <summary>
/// ObservableCollection that raises CollectionChanged on the UI thread when needed.
/// </summary>
public sealed class ObservableCollectionEx<T> : ObservableCollection<T>
{
    public ObservableCollectionEx()
    {
    }

    public ObservableCollectionEx(IEnumerable<T> items) : base(items)
    {
    }

    public void Reset(IEnumerable<T> items)
    {
        Items.Clear();
        foreach (var item in items)
            Items.Add(item);
        OnPropertyChanged(new PropertyChangedEventArgs(nameof(Count)));
        OnPropertyChanged(new PropertyChangedEventArgs("Item[]"));
        OnCollectionChanged(new NotifyCollectionChangedEventArgs(NotifyCollectionChangedAction.Reset));
    }
}
