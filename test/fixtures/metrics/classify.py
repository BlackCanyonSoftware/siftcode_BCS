def classify(items, limit):
    score = 0
    for item in items:
        if item > limit and item < 100:
            score += 1
        elif item == 0 or item < 0:
            score -= 1
        else:
            score += 2
    while score > 10:
        score -= 3
    match score:
        case 1:
            score = 2
        case 2:
            score = 3
        case _:
            score = 0
    try:
        score += 1 if limit > 5 else 2
    except ValueError:
        score = 0
    return score
