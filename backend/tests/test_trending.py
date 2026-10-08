from explainer.trending import Pick, Source, attach

STORIES = [
    Source(title="Stratego AI beats humans", url="https://example.org/stratego"),
    Source(title="Ask HN: how do you test LLM apps?", url="https://news.ycombinator.com/item?id=1"),
    Source(title="A sneaky link", url="javascript:alert(1)"),
]


def test_each_question_gets_the_story_its_headline_number_names():
    out = attach([Pick(question="How does an AI plan when it can't see the board?", headline=1)], STORIES)
    assert out[0].source == STORIES[0]


def test_a_number_out_of_range_or_a_non_http_link_leaves_the_question_unlinked():
    out = attach([Pick(question="a?", headline=0), Pick(question="b?", headline=9), Pick(question="c?", headline=3)], STORIES)
    assert [e.source for e in out] == [None, None, None]
    assert [e.question for e in out] == ["a?", "b?", "c?"]
