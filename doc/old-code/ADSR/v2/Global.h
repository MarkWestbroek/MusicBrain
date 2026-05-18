///////////////////////////////////////////////////////////
//  Global.h
//  Implementation of the Class Global
//  Created on:      14-mrt-2021 23:31:45
//  Original author: Mark
///////////////////////////////////////////////////////////

#if !defined(EA_FF9448A4_569C_41bb_9558_43875E22C044__INCLUDED_)
#define EA_FF9448A4_569C_41bb_9558_43875E22C044__INCLUDED_

#include "DebugState.h"
#include "DebugOutput.h"

class Global
{

public:
	Global();
	Global(DebugState debugState);
	virtual ~Global();
	DebugOutput *mDebugOutput;

	void SetDebugState(DebugState debugState);
	DebugState GetDebugState();
	void Global::Channel(Channel channel);
	Channel Global::GetChannel();

private:
	DebugState mDebugState;
	Channel mChannel;

};
#endif // !defined(EA_FF9448A4_569C_41bb_9558_43875E22C044__INCLUDED_)
