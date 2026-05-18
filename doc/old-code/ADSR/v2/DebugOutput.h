///////////////////////////////////////////////////////////
//  DebugOutput.h
//  Implementation of the Class DebugOutput
//  Created on:      15-mrt-2021 00:55:01
//  Original author: Mark
///////////////////////////////////////////////////////////

#if !defined(EA_CC5E537F_50F9_4de5_8E91_B83A9B93A0D8__INCLUDED_)
#define EA_CC5E537F_50F9_4de5_8E91_B83A9B93A0D8__INCLUDED_

#include "Channel.h"

class DebugOutput
{

public:
	DebugOutput();
	DebugOutput(Channel channel);
	virtual ~DebugOutput();
	void Var(const char* name, String value);
	void Var(const char* name, int value);
	void Var(const char* name, float value);
	void Var(const char* name, char value);
	void SetChannel(Channel channel);
	Channel GetChannel();

private:
	Channel mChannel;

};
#endif // !defined(EA_CC5E537F_50F9_4de5_8E91_B83A9B93A0D8__INCLUDED_)
