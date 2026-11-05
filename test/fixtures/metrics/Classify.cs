using System;

public class Classifier
{
    public int Classify(int[] items, int limit)
    {
        var score = 0;
        foreach (var item in items)
        {
            if (item > limit && item < 100)
            {
                score += 1;
            }
            else if (item == 0 || item < 0)
            {
                score -= 1;
            }
            else
            {
                score += 2;
            }
        }
        while (score > 10)
        {
            score -= 3;
        }
        switch (score)
        {
            case 1:
                score = 2;
                break;
            case 2:
                score = 3;
                break;
            default:
                score = 0;
                break;
        }
        try
        {
            score += limit > 5 ? 1 : 2;
        }
        catch (Exception)
        {
            score = 0;
        }
        return score;
    }
}
