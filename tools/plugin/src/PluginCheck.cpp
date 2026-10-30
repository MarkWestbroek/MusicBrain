// mmb-plugin-check: laadt een VST3 zoals een DAW dat doet, zet parameters,
// stuurt er een impuls door en schrijft de impulsrespons als wav. Zo bewijst
// de plugin zich zonder DAW; tools/plugin/check_ir.py meet de galmtijd.
//
//   mmb-plugin-check <pad.vst3> <uit.wav> [seconden] [param=waarde ...] [in=<bron.wav>] [sc=<sleutel.wav>] [notes=60,64,67] [seq=<noten.txt>]
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
    if (plugin->getNumPrograms() > 1) {
        std::printf("programma's (%d):", plugin->getNumPrograms());
        for (int i = 0; i < plugin->getNumPrograms(); ++i) std::printf(" [%d] %s", i, plugin->getProgramName(i).toRawUTF8());
        std::printf("\n");
    }
    // program=<n>: een fabriekspreset kiezen (zoals het presetmenu van een DAW), vóór de losse parameters.
    for (int a = 4; a < argc; ++a) {
        const juce::String arg(argv[a]);
        if (!arg.startsWith("program=")) continue;
        plugin->setCurrentProgram(arg.fromFirstOccurrenceOf("=", false, false).getIntValue());
        std::printf("programma %d: %s\n", plugin->getCurrentProgram(), plugin->getProgramName(plugin->getCurrentProgram()).toRawUTF8());
        for (auto* p : plugin->getParameters()) std::printf("  %s = %s\n", p->getName(64).toRawUTF8(), p->getCurrentValueAsText().toRawUTF8());
    }

    // Door de VST3-grens heen ziet een host alleen namen en tekst, geen
    // id's of bereiken: zoeken op naam (zonder spaties/streepjes, kleine
    // letters) en de tekst door de plugin zelf laten omzetten, zoals een DAW
    // doet als je een waarde intikt. Een keuze krijgt zijn naam (algo=Room).
    for (int a = 4; a < argc; ++a) {
        const juce::String arg(argv[a]);
        if (arg.startsWith("editor=") || arg.startsWith("poke=") || arg.startsWith("in=") || arg.startsWith("sc=") || arg.startsWith("notes=") || arg.startsWith("program=") || arg.startsWith("ownbank=") || arg.startsWith("instances=") || arg.startsWith("savestate=") || arg.startsWith("loadstate=") ||
            arg.startsWith("press=") || arg.startsWith("cc=") || arg.startsWith("at=") || arg.startsWith("seq=")) continue;   // geen parameter
        const juce::String id = arg.upToFirstOccurrenceOf("=", false, false).toLowerCase();
        const juce::String text = arg.fromFirstOccurrenceOf("=", false, false);
        bool hit = false;
        for (auto* p : plugin->getParameters()) {
            // Op naam zonder spaties/streepjes, of op alleen letters en cijfers ("Lo ×" → lo).
            const juce::String name = p->getName(64).removeCharacters(" -").toLowerCase();
            const juce::String plain = name.retainCharacters("abcdefghijklmnopqrstuvwxyz0123456789");
            if (name != id && plain != id) continue;
            p->setValueNotifyingHost(p->getValueForText(text));
            std::printf("  %s = %s\n", p->getName(64).toRawUTF8(), p->getCurrentValueAsText().toRawUTF8());
            hit = true;
        }
        if (!hit) {
            std::fprintf(stderr, "onbekende parameter %s; er zijn:", id.toRawUTF8());
            for (auto* p : plugin->getParameters())
                if (!p->getName(64).startsWith("MIDI CC "))   // JUCE's CC-proxy's (VST3_EMULATE_MIDI_CC)
                    std::fprintf(stderr, " %s", p->getName(64).removeCharacters(" -").toLowerCase().toRawUTF8());
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
                if (p->getName(64).removeCharacters(" -").toLowerCase() == id ||
                    p->getName(64).removeCharacters(" -").toLowerCase().retainCharacters("abcdefghijklmnopqrstuvwxyz0123456789") == id) {
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
    // sc=<sleutel.wav>: op de sidechain-ingang (PUMP, Bus comp), vanaf het begin.
    juce::AudioBuffer<float> side;
    for (int a = 4; a < argc; ++a) {
        const juce::String arg(argv[a]);
        if (!arg.startsWith("sc=")) continue;
        juce::AudioFormatManager formatsIn;
        formatsIn.registerBasicFormats();
        std::unique_ptr<juce::AudioFormatReader> reader(formatsIn.createReaderFor(juce::File(arg.fromFirstOccurrenceOf("=", false, false))));
        if (!reader) { std::fprintf(stderr, "kan %s niet lezen\n", arg.toRawUTF8()); return 1; }
        side.setSize(2, static_cast<int>(reader->lengthInSamples));
        reader->read(&side, 0, static_cast<int>(reader->lengthInSamples), 0, true, true);
        if (reader->numChannels == 1) side.copyFrom(1, 0, side, 0, 0, side.getNumSamples());
    }
    // notes=60,64,67: een instrument krijgt deze noten, de eerste helft aan.
    juce::Array<int> notes;
    for (int a = 4; a < argc; ++a) {
        const juce::String arg(argv[a]);
        if (!arg.startsWith("notes=")) continue;
        juce::StringArray parts;
        parts.addTokens(arg.fromFirstOccurrenceOf("=", false, false), ",", "");
        for (const auto& t : parts) notes.add(t.getIntValue());
    }
    const double useRate = source.getNumSamples() > 0 ? sourceRate : rate;
    plugin->setPlayConfigDetails(2, 2, useRate, block);
    if (side.getNumSamples() > 0) {
        auto layout = plugin->getBusesLayout();
        if (layout.inputBuses.size() < 2) { std::fprintf(stderr, "sc=: deze plugin heeft geen sidechain-ingang\n"); return 1; }
        layout.inputBuses.getReference(1) = juce::AudioChannelSet::stereo();
        if (!plugin->setBusesLayout(layout)) { std::fprintf(stderr, "sc=: sidechain niet aan te zetten\n"); return 1; }
        std::printf("sidechain aan: %d ingangskanalen\n", plugin->getTotalNumInputChannels());
    }
    plugin->prepareToPlay(useRate, block);
    // ownbank=<.mmbs>: een eigen bank zoals een project hem bewaart (toestand
    // "MMBP" + XML + bank, MmbPluginBase.h), via setStateInformation.
    for (int a = 4; a < argc; ++a) {
        const juce::String arg(argv[a]);
        if (!arg.startsWith("ownbank=")) continue;
        const juce::File f(arg.fromFirstOccurrenceOf("=", false, false));
        juce::MemoryBlock bank, host;
        if (!f.loadFileAsData(bank)) { std::fprintf(stderr, "kan %s niet lezen\n", f.getFullPathName().toRawUTF8()); return 1; }
        // Als gastheer verpakt JUCE de VST3-toestand: XML "VST3PluginState" met
        // de toestand van de plugin zelf (base64) in "IComponent". Daarin komt
        // de eigen bank, precies zoals de plugin hem in een project zet.
        plugin->getStateInformation(host);
        auto xml = juce::AudioProcessor::getXmlFromBinary(host.getData(), static_cast<int>(host.getSize()));
        auto* comp = xml ? xml->getChildByName("IComponent") : nullptr;
        juce::MemoryBlock inner, st;
        if (!comp || !inner.fromBase64Encoding(comp->getAllSubText())) { std::fprintf(stderr, "ownbank: geen VST3-toestand\n"); return 1; }
        juce::MemoryOutputStream o(st, false);
        o.write("MMBP", 4); o.writeInt(static_cast<int>(inner.getSize())); o << inner;
        o.writeString(f.getFileNameWithoutExtension()); o.writeInt64(static_cast<juce::int64>(bank.getSize())); o << bank;
        o.flush();
        comp->deleteAllTextElements();
        comp->addTextElement(st.toBase64Encoding());
        juce::MemoryBlock wrapped;
        juce::AudioProcessor::copyXmlToBinary(*xml, wrapped);
        plugin->setStateInformation(wrapped.getData(), static_cast<int>(wrapped.getSize()));
        juce::MemoryBlock back, backInner;
        plugin->getStateInformation(back);
        auto xb = juce::AudioProcessor::getXmlFromBinary(back.getData(), static_cast<int>(back.getSize()));
        if (auto* c = xb ? xb->getChildByName("IComponent") : nullptr) backInner.fromBase64Encoding(c->getAllSubText());
        std::printf("eigen bank %s (%zu bytes); toestand van de plugin terug: %zu bytes%s\n", f.getFileName().toRawUTF8(), bank.getSize(),
                    backInner.getSize(), backInner.getSize() > 4 && std::memcmp(backInner.getData(), "MMBP", 4) == 0 ? " (MMBP)" : "");
    }
    // loadstate=<bestand>: de toestand zoals een DAW hem bij het openen van
    // een project teruggeeft (eerder geschreven met savestate=).
    for (int a = 4; a < argc; ++a) {
        const juce::String arg(argv[a]);
        if (!arg.startsWith("loadstate=")) continue;
        juce::MemoryBlock st;
        if (!juce::File(arg.fromFirstOccurrenceOf("=", false, false)).loadFileAsData(st)) { std::fprintf(stderr, "kan %s niet lezen\n", arg.toRawUTF8()); return 1; }
        plugin->setStateInformation(st.getData(), static_cast<int>(st.getSize()));
        std::printf("toestand geladen (%zu bytes)\n", st.getSize());
    }
    // Eén stil blok en de message-loop even laten lopen: parameters die iets
    // op de message-thread doen (de Bank-knop laadt een bestand) zijn dan klaar.
    {
        juce::AudioBuffer<float> warm(2, block);
        juce::MidiBuffer none;
        warm.clear();
        plugin->processBlock(warm, none);
        juce::MessageManager::getInstance()->runDispatchLoopUntil(300);
        // De bank laadt op een eigen thread: wachten tot de DAW-tekst geen "laden" meer zegt.
        for (int t = 0; t < 100; ++t) {
            bool busy = false;
            for (auto* p : plugin->getParameters())
                if (p->getName(64) == "Bank" && p->getCurrentValueAsText().contains("laden")) {
                    if (t == 0) std::printf("tijdens het laden: Bank = %s\n", p->getCurrentValueAsText().toRawUTF8());
                    busy = true;
                }
            if (!busy) break;
            juce::MessageManager::getInstance()->runDispatchLoopUntil(100);
        }
    }
    // savestate=<bestand>: de toestand zoals een DAW hem in het project zet.
    for (int a = 4; a < argc; ++a) {
        const juce::String arg(argv[a]);
        if (!arg.startsWith("savestate=")) continue;
        juce::MemoryBlock st;
        plugin->getStateInformation(st);
        juce::File(arg.fromFirstOccurrenceOf("=", false, false)).replaceWithData(st.getData(), st.getSize());
        std::printf("toestand bewaard (%zu bytes)\n", st.getSize());
    }
    for (auto* p : plugin->getParameters())
        if (p->getName(64) == "Bank") std::printf("na het laden: Bank = %s\n", p->getCurrentValueAsText().toRawUTF8());
    // instances=N: N-1 extra exemplaren met dezelfde toestand, blok om blok
    // tussen het eerste door gedraaid. Elk exemplaar hoort hetzelfde te
    // geven; een gedeelde (globale) gastheer valt hier door de mand.
    std::vector<std::unique_ptr<juce::AudioPluginInstance>> extra;
    for (int a = 4; a < argc; ++a) {
        const juce::String arg(argv[a]);
        if (!arg.startsWith("instances=")) continue;
        juce::MemoryBlock st;
        plugin->getStateInformation(st);
        for (int k = 1; k < arg.fromFirstOccurrenceOf("=", false, false).getIntValue(); ++k) {
            auto p = formats.createPluginInstance(*found[0], useRate, block, error);
            if (!p) { std::fprintf(stderr, "exemplaar %d: %s\n", k + 1, error.toRawUTF8()); return 1; }
            p->setStateInformation(st.getData(), static_cast<int>(st.getSize()));
            p->setPlayConfigDetails(2, 2, useRate, block);
            p->prepareToPlay(useRate, block);
            juce::AudioBuffer<float> warm(2, block);
            juce::MidiBuffer none;
            warm.clear();
            p->processBlock(warm, none);
            extra.push_back(std::move(p));
        }
        juce::MessageManager::getInstance()->runDispatchLoopUntil(300);
    }
    const int total = source.getNumSamples() + static_cast<int>(seconds * useRate);
    std::vector<juce::AudioBuffer<float>> extraOut(extra.size(), juce::AudioBuffer<float>(2, total));
    juce::AudioBuffer<float> out(2, total);
    juce::AudioBuffer<float> buf(juce::jmax(2, plugin->getTotalNumInputChannels()), block);
    juce::MidiBuffer midi;
    const int holdUntil = total / 2;
    // press=<0..127>: kanaal-aftertouch vanaf een kwart (tot het loslaten);
    // cc=<nummer>:<waarde>: een controller vanaf het begin (cc=1:100 = modwheel).
    int press = -1;
    std::vector<std::pair<int, int>> ccs;
    for (int a = 4; a < argc; ++a) {
        const juce::String arg(argv[a]);
        if (arg.startsWith("press=")) press = arg.fromFirstOccurrenceOf("=", false, false).getIntValue();
        if (arg.startsWith("cc=")) ccs.emplace_back(arg.fromFirstOccurrenceOf("=", false, false).upToFirstOccurrenceOf(":", false, false).getIntValue(),
                                                     arg.fromFirstOccurrenceOf(":", false, false).getIntValue());
    }
    // at=<seconden>:<param>=<waarde>: een parameter tijdens het renderen zetten
    // (bv. een bypass omzetten midden in een noot).
    struct At { int pos; juce::AudioProcessorParameter* p; float v; bool done; };
    std::vector<At> ats;
    for (int a = 4; a < argc; ++a) {
        const juce::String arg(argv[a]);
        if (!arg.startsWith("at=")) continue;
        const juce::String rest = arg.fromFirstOccurrenceOf("=", false, false);
        const int at = static_cast<int>(rest.upToFirstOccurrenceOf(":", false, false).getDoubleValue() * useRate);
        const juce::String id = rest.fromFirstOccurrenceOf(":", false, false).upToFirstOccurrenceOf("=", false, false).toLowerCase();
        const juce::String text = rest.fromLastOccurrenceOf("=", false, false);
        for (auto* p : plugin->getParameters())
            if (p->getName(64).removeCharacters(" -").toLowerCase().retainCharacters("abcdefghijklmnopqrstuvwxyz0123456789") == id)
                ats.push_back({ at, p, p->getValueForText(text), false });
    }
    const int pressAt = total / 4;
    // seq=<bestand>: een notenreeks in plaats van het akkoord; per regel
    // "<seconden> <noot> <aanslag>" (aanslag 0 = loslaten).
    struct SeqEv { int pos; int note, vel; };
    std::vector<SeqEv> seq;
    for (int a = 4; a < argc; ++a) {
        const juce::String arg(argv[a]);
        if (!arg.startsWith("seq=")) continue;
        juce::StringArray lines;
        juce::File(arg.fromFirstOccurrenceOf("=", false, false)).readLines(lines);
        for (const auto& l : lines) {
            auto t = juce::StringArray::fromTokens(l, " ", "");
            if (t.size() >= 3) seq.push_back({ static_cast<int>(t[0].getDoubleValue() * useRate), t[1].getIntValue(), t[2].getIntValue() });
        }
        notes.clear();
    }
    for (int pos = 0; pos < total; pos += block) {
        buf.clear();
        midi.clear();
        const int n = juce::jmin(block, total - pos);
        if (pos == 0) for (int note : notes) midi.addEvent(juce::MidiMessage::noteOn(1, note, 0.8f), 0);
        if (pos == 0) for (const auto& [cc, v] : ccs) midi.addEvent(juce::MidiMessage::controllerEvent(1, cc, v), 0);
        if (press >= 0 && pos <= pressAt && pressAt < pos + n) midi.addEvent(juce::MidiMessage::channelPressureChange(1, press), pressAt - pos);
        if (press >= 0 && pos <= holdUntil && holdUntil < pos + n) midi.addEvent(juce::MidiMessage::channelPressureChange(1, 0), holdUntil - pos);
        if (pos <= holdUntil && holdUntil < pos + n) for (int note : notes) midi.addEvent(juce::MidiMessage::noteOff(1, note), holdUntil - pos);
        for (const auto& e : seq)
            if (pos <= e.pos && e.pos < pos + n)
                midi.addEvent(e.vel > 0 ? juce::MidiMessage::noteOn(1, e.note, static_cast<juce::uint8>(e.vel)) : juce::MidiMessage::noteOff(1, e.note), e.pos - pos);
        if (source.getNumSamples() > 0) {
            const int avail = juce::jmin(n, source.getNumSamples() - pos);
            for (int c = 0; c < 2 && avail > 0; ++c) buf.copyFrom(c, 0, source, c, pos, avail);
        } else if (pos == 0) {
            buf.setSample(0, 0, 1.0f);   // de impuls, links
        }
        if (side.getNumSamples() > 0 && buf.getNumChannels() >= 4) {
            const int avail = juce::jmin(n, side.getNumSamples() - pos);
            for (int c = 0; c < 2 && avail > 0; ++c) buf.copyFrom(2 + c, 0, side, c, pos, avail);
        }
        for (auto& t : ats) if (!t.done && pos >= t.pos) { t.p->setValueNotifyingHost(t.v); t.done = true; }
        juce::AudioBuffer<float> in(buf);
        juce::MidiBuffer midiIn(midi);
        plugin->processBlock(buf, midi);
        for (int c = 0; c < 2; ++c) out.copyFrom(c, pos, buf, c, 0, n);
        for (std::size_t k = 0; k < extra.size(); ++k) {
            juce::AudioBuffer<float> b(in);
            juce::MidiBuffer m(midiIn);
            extra[k]->processBlock(b, m);
            for (int c = 0; c < 2; ++c) extraOut[k].copyFrom(c, pos, b, c, 0, n);
        }
    }
    plugin->releaseResources();
    for (std::size_t k = 0; k < extra.size(); ++k) {
        float diff = 0.0f;
        for (int c = 0; c < 2; ++c)
            for (int i = 0; i < total; ++i) diff = juce::jmax(diff, std::abs(extraOut[k].getSample(c, i) - out.getSample(c, i)));
        std::printf("exemplaar %zu: piek %.3f, verschil met het eerste %.2e\n", k + 2, extraOut[k].getMagnitude(0, total), diff);
        extra[k]->releaseResources();
    }

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
