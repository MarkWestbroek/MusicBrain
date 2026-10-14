// mmb-plugin-check: laadt een VST3 zoals een DAW dat doet, zet parameters,
// stuurt er een impuls door en schrijft de impulsrespons als wav. Zo bewijst
// de plugin zich zonder DAW; tools/plugin/check_ir.py meet de galmtijd.
//
//   mmb-plugin-check <pad.vst3> <uit.wav> [seconden] [param=waarde ...]
//
// Waarden zijn in de eenheden van de parameter (decay=3 is 3 s); een keuze-
// parameter krijgt zijn index (algo=2).

#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>

#include <cstdio>
#include <memory>

int main(int argc, char** argv) {
    if (argc < 3) { std::fprintf(stderr, "gebruik: mmb-plugin-check <pad.vst3> <uit.wav> [seconden] [param=waarde ...]\n"); return 2; }
    juce::ScopedJuceInitialiser_GUI juceInit;   // de VST3-host wil een message-thread

    const juce::String path = juce::String::fromUTF8(argv[1]);
    const juce::File outFile(juce::String::fromUTF8(argv[2]));
    const double seconds = argc > 3 ? juce::String(argv[3]).getDoubleValue() : 4.0;
    constexpr double rate = 44100.0;
    constexpr int block = 64;

    juce::AudioPluginFormatManager formats;
    formats.addDefaultFormats();
    juce::OwnedArray<juce::PluginDescription> found;
    for (auto* f : formats.getFormats()) f->findAllTypesForFile(found, path);
    if (found.isEmpty()) { std::fprintf(stderr, "geen plugin gevonden in %s\n", argv[1]); return 1; }

    juce::String error;
    std::unique_ptr<juce::AudioPluginInstance> plugin = formats.createPluginInstance(*found[0], rate, block, error);
    if (!plugin) { std::fprintf(stderr, "laden mislukt: %s\n", error.toRawUTF8()); return 1; }
    std::printf("geladen: %s (%s), %d parameters, vertraging %d samples\n",
                plugin->getName().toRawUTF8(), found[0]->pluginFormatName.toRawUTF8(),
                plugin->getParameters().size(), plugin->getLatencySamples());

    // Door de VST3-grens heen ziet een host alleen namen en tekst, geen
    // id's of bereiken: zoeken op naam (zonder spaties/streepjes, kleine
    // letters) en de tekst door de plugin zelf laten omzetten, zoals een DAW
    // doet als je een waarde intikt. Een keuze krijgt zijn naam (algo=Room).
    for (int a = 4; a < argc; ++a) {
        const juce::String arg(argv[a]);
        const juce::String id = arg.upToFirstOccurrenceOf("=", false, false).toLowerCase();
        const juce::String text = arg.fromFirstOccurrenceOf("=", false, false);
        bool hit = false;
        for (auto* p : plugin->getParameters()) {
            const juce::String name = p->getName(64).removeCharacters(" -").toLowerCase();
            if (name != id) continue;
            p->setValueNotifyingHost(p->getValueForText(text));
            std::printf("  %s = %s\n", p->getName(64).toRawUTF8(), p->getCurrentValueAsText().toRawUTF8());
            hit = true;
        }
        if (!hit) {
            std::fprintf(stderr, "onbekende parameter %s; er zijn:", id.toRawUTF8());
            for (auto* p : plugin->getParameters()) std::fprintf(stderr, " %s", p->getName(64).removeCharacters(" -").toLowerCase().toRawUTF8());
            std::fprintf(stderr, "\n");
            return 1;
        }
    }

    plugin->setPlayConfigDetails(2, 2, rate, block);
    plugin->prepareToPlay(rate, block);
    const int total = static_cast<int>(seconds * rate);
    juce::AudioBuffer<float> out(2, total);
    juce::AudioBuffer<float> buf(2, block);
    juce::MidiBuffer midi;
    for (int pos = 0; pos < total; pos += block) {
        buf.clear();
        if (pos == 0) buf.setSample(0, 0, 1.0f);   // de impuls, links
        plugin->processBlock(buf, midi);
        const int n = juce::jmin(block, total - pos);
        for (int c = 0; c < 2; ++c) out.copyFrom(c, pos, buf, c, 0, n);
    }
    plugin->releaseResources();

    outFile.deleteFile();
    juce::WavAudioFormat wav;
    std::unique_ptr<juce::AudioFormatWriter> writer(wav.createWriterFor(
        new juce::FileOutputStream(outFile), rate, 2, 32, {}, 0));
    if (!writer) { std::fprintf(stderr, "kan %s niet schrijven\n", argv[2]); return 1; }
    writer->writeFromAudioSampleBuffer(out, 0, total);
    writer.reset();
    std::printf("geschreven: %s (%.1f s, piek %.3f)\n", argv[2], seconds, out.getMagnitude(0, total));
    return 0;
}
