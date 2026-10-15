// mmb-plugin-check: laadt een VST3 zoals een DAW dat doet, zet parameters,
// stuurt er een impuls door en schrijft de impulsrespons als wav. Zo bewijst
// de plugin zich zonder DAW; tools/plugin/check_ir.py meet de galmtijd.
//
//   mmb-plugin-check <pad.vst3> <uit.wav> [seconden] [param=waarde ...] [in=<bron.wav>]
//
// Waarden zijn in de eenheden van de parameter (decay=3 is 3 s); een keuze-
// parameter krijgt zijn naam (algorithm=Room). Met in=<bron.wav> gaat dat
// bestand door de plugin (plus de staart) in plaats van een impuls: zo hoor
// je de plugin zonder DAW.

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
        if (arg.startsWith("editor=") || arg.startsWith("poke=") || arg.startsWith("in=")) continue;   // geen parameter
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

    // "editor=<seconden>": de bediening openen (zoals een DAW), zo lang laten
    // staan, en daarna de parameters printen. Zo is te zien of een knop in het
    // paneel de parameter haalt en of een vooraf gezette parameter in het
    // paneel staat (tools/plugin/README.md).
    for (int a = 4; a < argc; ++a) {
        const juce::String arg(argv[a]);
        if (!arg.startsWith("editor=")) continue;
        const double secs = arg.fromFirstOccurrenceOf("=", false, false).getDoubleValue();
        auto printParams = [&] {
            for (auto* p : plugin->getParameters())
                std::printf("  %s = %s\n", p->getName(64).toRawUTF8(), p->getCurrentValueAsText().toRawUTF8());
        };
        std::printf("parameters voor de bediening:\n"); printParams();
        std::unique_ptr<juce::AudioProcessorEditor> editor(plugin->createEditorIfNeeded());
        if (!editor) { std::fprintf(stderr, "plugin heeft geen bediening\n"); return 1; }
        juce::DocumentWindow window("mmb-plugin-check", juce::Colours::black, juce::DocumentWindow::allButtons);
        window.setUsingNativeTitleBar(true);
        window.setContentNonOwned(editor.get(), true);
        window.centreWithSize(editor->getWidth(), editor->getHeight());
        window.setVisible(true);
        std::printf("bediening open (%d x %d) gedurende %.0f s\n", editor->getWidth(), editor->getHeight(), secs);
        std::fflush(stdout);
        // Halverwege een parameter vanuit de gastheer zetten ("poke=decay:20"):
        // de bediening hoort mee te gaan.
        juce::MessageManager::getInstance()->runDispatchLoopUntil(static_cast<int>(secs * 500.0));
        for (int b = 4; b < argc; ++b) {
            const juce::String poke(argv[b]);
            if (!poke.startsWith("poke=")) continue;
            const juce::String id = poke.fromFirstOccurrenceOf("=", false, false).upToFirstOccurrenceOf(":", false, false).toLowerCase();
            const juce::String text = poke.fromFirstOccurrenceOf(":", false, false);
            for (auto* p : plugin->getParameters())
                if (p->getName(64).removeCharacters(" -").toLowerCase() == id) {
                    p->setValueNotifyingHost(p->getValueForText(text));
                    std::printf("poke: %s = %s\n", p->getName(64).toRawUTF8(), p->getCurrentValueAsText().toRawUTF8());
                    std::fflush(stdout);
                }
        }
        juce::MessageManager::getInstance()->runDispatchLoopUntil(static_cast<int>(secs * 500.0));
        window.setVisible(false);
        window.clearContentComponent();
        plugin->editorBeingDeleted(editor.get());
        editor.reset();
        std::printf("parameters na de bediening:\n"); printParams();
        return 0;
    }

    // Bron: een impuls, of een wav (in=...), in de samplerate van dat bestand.
    juce::AudioBuffer<float> source;
    double sourceRate = rate;
    for (int a = 4; a < argc; ++a) {
        const juce::String arg(argv[a]);
        if (!arg.startsWith("in=")) continue;
        juce::AudioFormatManager formatsIn;
        formatsIn.registerBasicFormats();
        std::unique_ptr<juce::AudioFormatReader> reader(formatsIn.createReaderFor(juce::File(arg.fromFirstOccurrenceOf("=", false, false))));
        if (!reader) { std::fprintf(stderr, "kan %s niet lezen\n", arg.toRawUTF8()); return 1; }
        source.setSize(2, static_cast<int>(reader->lengthInSamples));
        reader->read(&source, 0, static_cast<int>(reader->lengthInSamples), 0, true, true);
        if (reader->numChannels == 1) source.copyFrom(1, 0, source, 0, 0, source.getNumSamples());
        sourceRate = reader->sampleRate;
        std::printf("bron: %s (%.1f s, %d kanalen, %.0f Hz) + %.1f s staart\n", arg.fromFirstOccurrenceOf("=", false, false).toRawUTF8(),
                    source.getNumSamples() / sourceRate, static_cast<int>(reader->numChannels), sourceRate, seconds);
    }
    const double useRate = source.getNumSamples() > 0 ? sourceRate : rate;
    plugin->setPlayConfigDetails(2, 2, useRate, block);
    plugin->prepareToPlay(useRate, block);
    const int total = source.getNumSamples() + static_cast<int>(seconds * useRate);
    juce::AudioBuffer<float> out(2, total);
    juce::AudioBuffer<float> buf(2, block);
    juce::MidiBuffer midi;
    for (int pos = 0; pos < total; pos += block) {
        buf.clear();
        const int n = juce::jmin(block, total - pos);
        if (source.getNumSamples() > 0) {
            const int avail = juce::jmin(n, source.getNumSamples() - pos);
            for (int c = 0; c < 2 && avail > 0; ++c) buf.copyFrom(c, 0, source, c, pos, avail);
        } else if (pos == 0) {
            buf.setSample(0, 0, 1.0f);   // de impuls, links
        }
        plugin->processBlock(buf, midi);
        for (int c = 0; c < 2; ++c) out.copyFrom(c, pos, buf, c, 0, n);
    }
    plugin->releaseResources();

    outFile.deleteFile();
    juce::WavAudioFormat wav;
    std::unique_ptr<juce::AudioFormatWriter> writer(wav.createWriterFor(
        new juce::FileOutputStream(outFile), useRate, 2, 32, {}, 0));
    if (!writer) { std::fprintf(stderr, "kan %s niet schrijven\n", argv[2]); return 1; }
    writer->writeFromAudioSampleBuffer(out, 0, total);
    writer.reset();
    std::printf("geschreven: %s (%.1f s, piek %.3f)\n", argv[2], total / useRate, out.getMagnitude(0, total));
    return 0;
}
