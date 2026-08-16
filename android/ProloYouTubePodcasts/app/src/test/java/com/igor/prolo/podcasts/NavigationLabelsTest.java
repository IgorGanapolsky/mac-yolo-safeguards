package com.igor.prolo.podcasts;

public final class NavigationLabelsTest {
    public static void main(String[] args) {
        require(NavigationLabels.matches("Library tab, 5 of 5", "library"));
        require(NavigationLabels.matchesAny("Podcasts filter", NavigationLabels.PODCASTS));
        require(NavigationLabels.matchesAny("New Episodes playlist", NavigationLabels.NEW_EPISODES));
        require(NavigationLabels.matchesAny("Play New Episodes", NavigationLabels.PLAY));
        require(!NavigationLabels.matchesAny("Playback settings", NavigationLabels.PLAY));
        require(!NavigationLabels.matchesAny("Music", NavigationLabels.PODCASTS));
        System.out.println("NavigationLabelsTest: PASS (6 assertions)");
    }

    private static void require(boolean value) {
        if (!value) throw new AssertionError("navigation label contract failed");
    }
}
