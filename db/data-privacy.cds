using { jones.vob as vob } from './schema';
annotate vob.VendorRequests with @PersonalData: {
  DataSubjectRole: 'Vendor',
  EntitySemantics: 'DataSubject'
} {
  ID @PersonalData.FieldSemantics: 'DataSubjectID';
};
