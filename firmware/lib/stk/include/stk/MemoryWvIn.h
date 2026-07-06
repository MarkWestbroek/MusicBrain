#pragma once
/***************************************************/
/*! \class stk::MemoryWvIn
    \brief MMB-toevoeging: sample-playback uit een in-flash int16-array.

    Vervangt stk::FileWvIn op de Teensy (geen bestandssysteem). Implementeert
    precies de subset die stk::Mandolin gebruikt: setRate(), reset(), tick(),
    lastOut() en isFinished(). One-shot afspelen met lineaire interpolatie bij
    niet-integer rate — semantisch gelijk aan FileWvIn met doNormalize=true
    (de peak-parameter van setData() doet de normalisatie naar plus/minus 1).

    Dit is tevens een generieke wavetable/sample-oscillator-primitief: geef
    hem een const array in flash en een rate (stapgrootte per tick).
*/
/***************************************************/

#include "Stk.h"
#include <cstdint>
#include <cmath>

namespace stk {

class MemoryWvIn : public Stk
{
public:
  MemoryWvIn( void ) {}

  //! Koppel een int16-array (bijv. const in flash). \c peak is de maximale
  //! absolute samplewaarde en bepaalt de normalisatie (zoals FileWvIn::normalize).
  void setData( const int16_t* data, unsigned long size, StkFloat peak = 32768.0f ) {
    data_ = data;
    size_ = size;
    scale_ = ( peak > 0.0f ) ? 1.0f / peak : 0.0f;
    this->reset();
  }

  //! Terug naar het begin van de sample.
  void reset( void ) {
    time_ = 0.0f;
    lastOut_ = 0.0f;
    finished_ = ( data_ == nullptr || size_ == 0 );
  }

  //! \c true zodra het einde van de data bereikt is (one-shot).
  bool isFinished( void ) const { return finished_; }

  //! Afspeelsnelheid in samples per tick (1.0 = dataRate == sampleRate).
  void setRate( StkFloat rate ) {
    rate_ = rate;
    interpolate_ = ( fmodf( rate_, 1.0f ) != 0.0f );
  }

  StkFloat lastOut( unsigned int = 0 ) const { return lastOut_; }

  StkFloat tick( unsigned int = 0 ) {
    if ( finished_ ) return 0.0f;
    if ( time_ < 0.0f || time_ > (StkFloat)( size_ - 1 ) ) {
      finished_ = true;
      lastOut_ = 0.0f;
      return 0.0f;
    }

    const unsigned long i = (unsigned long) time_;
    StkFloat out = (StkFloat) data_[i];
    if ( interpolate_ && i + 1 < size_ ) {
      const StkFloat alpha = time_ - (StkFloat) i;
      out += alpha * ( (StkFloat) data_[i + 1] - out );
    }

    lastOut_ = out * scale_;
    time_ += rate_;
    return lastOut_;
  }

private:
  const int16_t* data_ = nullptr;
  unsigned long size_ = 0;
  StkFloat scale_ = 1.0f / 32768.0f;
  StkFloat rate_ = 1.0f;
  StkFloat time_ = 0.0f;
  StkFloat lastOut_ = 0.0f;
  bool interpolate_ = false;
  bool finished_ = true;
};

} // namespace stk
