package com.igor.prolo.podcasts;

import java.util.Locale;

final class NavigationLabels {
    private NavigationLabels() {}

    static final String[] LIBRARY = {"library", "library tab"};
    static final String[] PODCASTS = {"podcasts", "podcasts filter"};
    static final String[] NEW_EPISODES = {"new episodes", "new episodes playlist"};
    static final String[] PLAY = {"play new episodes", "play playlist", "play"};

    static boolean matchesAny(CharSequence value, String[] targets) {
        if (value == null) return false;
        for (String target : targets) {
            if (matches(value.toString(), target)) return true;
        }
        return false;
    }

    static boolean matches(String value, String target) {
        String normalizedValue = normalize(value);
        String normalizedTarget = normalize(target);
        return normalizedValue.equals(normalizedTarget)
                || normalizedValue.startsWith(normalizedTarget + " ")
                || normalizedValue.startsWith(normalizedTarget + ",");
    }

    private static String normalize(String value) {
        return value.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }
}
